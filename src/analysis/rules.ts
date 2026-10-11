import type { Graph } from '../model/graph'
import { lowestCommonAncestor, isDescendant } from '../model/graph'
import { overlaps, parsePath } from '../model/paths'
import type { PropEdge } from '../model/schema'

export type Severity = 'error' | 'warning' | 'info'

export interface Problem {
  rule: string
  severity: Severity
  title: string
  message: string
  fix: string
  /** first node is the one the problem is pinned to */
  nodes: string[]
  /** true when it needs code-level facts (stable, used, mutates) the diagram may not have in plan mode */
  codeLevel?: boolean
}

export interface RuleInfo {
  id: string
  name: string
  summary: string
}

export const RULES: RuleInfo[] = [
  { id: 'mutation', name: 'Data changed in place', summary: 'State must be updated immutably so React can see the change.' },
  { id: 'effect-loop', name: 'Effect updates its own dependency', summary: 'An effect that sets what it depends on can loop forever.' },
  { id: 'prop-drilling', name: 'Prop drilling', summary: 'Data passed through components that never use it.' },
  { id: 'derived-state', name: 'Stored derived state', summary: 'State that could be computed from other state during render.' },
  { id: 'server-state-copy', name: 'Server data copied into state', summary: 'Query results duplicated in local state go stale.' },
  { id: 'effect-chain', name: 'Chained effects', summary: 'One effect sets state that triggers another effect.' },
  { id: 'effect-derived-state', name: 'Effect used to sync state', summary: 'An effect that only copies or computes data from React state.' },
  { id: 'unstable-memo-prop', name: 'Unstable prop into memo', summary: 'A new object or function every render defeats React.memo.' },
  { id: 'busy-context', name: 'Busy context', summary: 'A frequently changing context re-renders every consumer.' },
  { id: 'list-key', name: 'Weak list key', summary: 'Lists keyed by index or without a key.' },
  { id: 'state-too-high', name: 'State placed too high', summary: 'State owned far above the only components that use it.' },
  { id: 'whole-store', name: 'Subscribes to the whole store', summary: 'No selector means a re-render on any store change.' },
  { id: 'duplicate-state', name: 'Possible duplicate state', summary: 'The same model held in more than one state.' },
]

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

export function runRules(g: Graph): Problem[] {
  const problems: Problem[] = []
  const add = (p: Problem) => problems.push(p)
  const { flow, byId } = g

  // mutation
  for (const e of flow.edges) {
    if (e.kind !== 'mutates') continue
    const owner = g.ownerOf.get(e.to)
    const notOwner = owner && owner !== e.from
    add({
      rule: 'mutation',
      severity: 'error',
      title: notOwner ? `${e.from} mutates ${e.to}, which it doesn't own` : `${e.from} mutates ${e.to} in place`,
      message: `${e.op ? `\`${e.op}\` changes` : 'This changes'} ${e.to} without creating a new value. React compares references, so components may not re-render, and memoized children show stale data.`,
      fix: notOwner
        ? `Pass a callback from ${owner} and update immutably there, e.g. setOrders(prev => prev.map(o => o.id === id ? { ...o, … } : o)).`
        : 'Create a new value instead: spread, map, filter or toSorted. Never push, splice, sort or assign into state.',
      nodes: [e.from, e.to],
      codeLevel: true,
    })
  }

  // effect-loop
  for (const eff of g.effects) {
    const loop = eff.sets.find((s) => eff.deps.some((d) => overlaps(parsePath(s), parsePath(d))))
    if (loop)
      add({
        rule: 'effect-loop',
        severity: 'error',
        title: `${eff.id} sets ${loop}, which is in its own dependencies`,
        message: 'Every run changes a dependency, which schedules another run. Without a guard this loops forever.',
        fix: 'Compute the value during render, or move the update into the event that causes it. If it must stay, add a condition that stops it once the value is correct.',
        nodes: [eff.id, parsePath(loop)[0]],
      })
  }

  // prop-drilling: chains of forward-only props
  const forwardOnly = (e: PropEdge) => e.used === false
  const reported = new Set<string>()
  for (const e of flow.edges) {
    if (e.kind !== 'prop' || !forwardOnly(e)) continue
    // only start at the top of a chain
    const into = (g.propsInto.get(e.from) ?? []).some((p) => forwardOnly(p) && sameValue(p, e))
    if (into) continue
    const chain: string[] = [e.to]
    let cur: PropEdge | undefined = e
    const guard = new Set<string>([e.from])
    while (cur && forwardOnly(cur) && !guard.has(cur.to)) {
      guard.add(cur.to)
      const prev: PropEdge = cur
      cur = (g.propsOutOf.get(prev.to) ?? []).find((p) => sameValue(p, prev))
      if (cur) chain.push(cur.to)
    }
    const passThrough = chain.slice(0, -1)
    const key = `${e.from}:${e.data ?? e.name}`
    if (passThrough.length >= 2 && !reported.has(key)) {
      reported.add(key)
      const what = e.data ?? e.name
      add({
        rule: 'prop-drilling',
        severity: 'warning',
        title: `${what} is drilled through ${passThrough.join(' → ')}`,
        message: `${passThrough.join(' and ')} receive ${what} only to pass it on to ${chain[chain.length - 1]}. Every change re-renders them, and every refactor has to touch them.`,
        fix: `Let ${chain[chain.length - 1]} read it directly (context or a store selector), or have ${e.from} pass the finished <${chain[chain.length - 1]} … /> element down as children.`,
        nodes: [passThrough[0], e.from, ...passThrough.slice(1), chain[chain.length - 1]],
        codeLevel: true,
      })
    }
  }

  // derived-state & server-state-copy
  for (const e of flow.edges) {
    if (e.kind !== 'derives') continue
    const from = byId.get(e.from)
    const to = byId.get(e.to)
    if (!to || (to.kind !== 'state' && to.kind !== 'store')) continue
    if (from?.kind === 'query') {
      add({
        rule: 'server-state-copy',
        severity: 'warning',
        title: `${e.to} copies server data from ${e.from}`,
        message: `The query cache already holds this data. A copy in ${to.kind} becomes a second source of truth that goes stale after refetches and mutations.`,
        fix: `Read ${e.from} directly where it's needed. Keep only UI state (filters, selected id, drafts) locally and derive the rest during render.`,
        nodes: [e.to, e.from],
      })
    } else {
      add({
        rule: 'derived-state',
        severity: 'warning',
        title: `${e.to} is stored but derived from ${e.from}`,
        message: `${e.to} can be calculated from ${e.from}. Storing it means keeping two values in sync and an extra render each time${e.via ? ` (${e.via})` : ''}.`,
        fix: `Compute it during render: const ${e.to} = …(${e.from}). Wrap in useMemo only if the calculation is expensive.`,
        nodes: [e.to, e.from],
      })
    }
  }

  // effect-chain
  for (const a of g.effects) {
    for (const b of g.effects) {
      if (a === b) continue
      const via = a.sets.find((s) => b.deps.some((d) => overlaps(parsePath(s), parsePath(d))))
      if (via)
        add({
          rule: 'effect-chain',
          severity: 'warning',
          title: `${a.id} triggers ${b.id} through ${via}`,
          message: `${a.id} sets ${via}, which makes ${b.id} run in a second pass. Each step costs a render, and the order is hard to follow.`,
          fix: 'Compute the final values in one place: during render, or in the event handler that starts the change.',
          nodes: [a.id, b.id],
        })
    }
  }

  // effect-derived-state (only when not already explained by a derives edge)
  for (const eff of g.effects) {
    if (eff.external || !eff.sets.length || !eff.deps.length) continue
    const explained = eff.sets.every((s) => flow.edges.some((e) => e.kind === 'derives' && e.to === parsePath(s)[0]))
    if (explained) continue
    add({
      rule: 'effect-derived-state',
      severity: 'warning',
      title: `${eff.id} syncs state from other React data`,
      message: `This effect reads ${eff.deps.join(', ')} and sets ${eff.sets.join(', ')}. The UI first renders with the old value, then again with the new one.`,
      fix: 'Derive the value during render, or set it in the event handler that changes the dependencies. Mark the effect external: true if it talks to something outside React.',
      nodes: [eff.id],
    })
  }

  // unstable-memo-prop
  for (const e of flow.edges) {
    if (e.kind !== 'prop' || e.stable !== false) continue
    const child = byId.get(e.to)
    if (child?.kind !== 'component' || !child.memo) continue
    add({
      rule: 'unstable-memo-prop',
      severity: 'warning',
      title: `${e.from} passes a new ${e.callback ? 'function' : 'value'} to memo ${e.to}`,
      message: `${e.name} is recreated on every render of ${e.from}, so React.memo on ${e.to} never skips a render.`,
      fix: e.callback
        ? `Wrap ${e.name} in useCallback in the component that creates it, or remove memo from ${e.to}.`
        : `Wrap ${e.name} in useMemo, pass primitives instead, or remove memo from ${e.to}.`,
      nodes: [e.to, e.from],
      codeLevel: true,
    })
  }

  // busy-context
  for (const n of flow.nodes) {
    if (n.kind !== 'context') continue
    const consumers = (g.edgesFrom.get(n.id) ?? []).filter((e) => e.kind === 'reads').map((e) => e.to)
    const busy = n.stable === false || n.updates === 'often'
    if (!busy || consumers.length < 3) continue
    add({
      rule: 'busy-context',
      severity: 'warning',
      title: `${n.id} re-renders ${consumers.length} consumers on every change`,
      message:
        n.stable === false
          ? `The value is a new object on every render of ${n.provider}, so all consumers re-render even when nothing they use changed.`
          : `It changes often, and every consumer re-renders even if it only uses one field.`,
      fix: `Memoize the value with useMemo, split it (e.g. state vs actions), or move it to a store with selectors so ${consumers.slice(0, 2).join(' and ')} only re-render for their fields.`,
      nodes: [n.id, ...consumers],
    })
  }

  // list-key
  for (const [parent, links] of g.children) {
    for (const l of links) {
      if (!l.isList) continue
      const key = l.listKey?.trim().toLowerCase()
      if (key === 'index' || key === 'none' || !key)
        add({
          rule: 'list-key',
          severity: key === 'index' ? 'info' : 'warning',
          title: key === 'index' ? `${parent} keys ${l.child} by index` : `${parent} renders ${l.child} without a key`,
          message:
            key === 'index'
              ? 'If the list is reordered, filtered or items are inserted, React reuses the wrong components and their state moves to the wrong rows.'
              : 'Without keys React matches items by position, which breaks state and is slower on updates.',
          fix: `Use a stable unique id from the data, e.g. key={${l.child.charAt(0).toLowerCase() + l.child.slice(1)}.id}.`,
          nodes: [parent, l.child],
        })
    }
  }

  // state-too-high
  for (const n of flow.nodes) {
    if (n.kind !== 'state') continue
    const users = new Set<string>()
    let ownerUses = false
    for (const e of flow.edges) {
      if (e.kind === 'reads' && e.from === n.id) users.add(e.to)
      if ((e.kind === 'writes' || e.kind === 'mutates') && e.to === n.id) users.add(e.from)
      if (e.kind === 'prop' && e.data && parsePath(e.data)[0] === n.id && e.used !== false) users.add(e.to)
    }
    for (const eff of g.effects)
      if (eff.owner === n.owner && [...eff.deps, ...eff.sets].some((d) => parsePath(d)[0] === n.id)) ownerUses = true
    if (users.has(n.owner)) ownerUses = true
    const comps = [...users].filter((u) => byId.get(u)?.kind === 'component')
    if (ownerUses || comps.length === 0) continue
    const lca = lowestCommonAncestor(g, comps)
    if (lca && lca !== n.owner && isDescendant(g, lca, n.owner))
      add({
        rule: 'state-too-high',
        severity: 'info',
        title: `${n.id} could live in ${lca}`,
        message: `Only ${comps.join(', ')} use ${n.id}, but ${n.owner} owns it, so every change re-renders ${n.owner} and everything below it.`,
        fix: `Move the state down to ${lca}. Keep it in ${n.owner} only if siblings outside ${lca} will need it soon.`,
        nodes: [n.id, n.owner, lca],
      })
  }

  // whole-store
  for (const e of flow.edges) {
    if (e.kind !== 'reads' || e.fields?.length) continue
    const src = byId.get(e.from)
    if (src?.kind !== 'store') continue
    add({
      rule: 'whole-store',
      severity: 'info',
      title: `${e.to} subscribes to all of ${e.from}`,
      message: `Without a selector, ${e.to} re-renders on every change to ${e.from}, including fields it never uses.`,
      fix: `Select only what ${e.to} needs, e.g. use${cap(e.from)}(s => s.theme).`,
      nodes: [e.to, e.from],
    })
  }

  // duplicate-state
  const byType = new Map<string, string[]>()
  for (const n of flow.nodes) {
    if (n.kind !== 'state') continue
    const base = n.type.replace(/\[\]$/, '').trim()
    if (!(base in flow.types)) continue
    const arr = byType.get(n.type) ?? []
    arr.push(n.id)
    byType.set(n.type, arr)
  }
  for (const [type, ids] of byType) {
    const owners = new Set(ids.map((i) => g.ownerOf.get(i)))
    if (ids.length < 2 || owners.size < 2) continue
    const linked = flow.edges.some((e) => e.kind === 'derives' && ids.includes(e.from) && ids.includes(e.to))
    if (linked) continue
    add({
      rule: 'duplicate-state',
      severity: 'info',
      title: `${ids.join(' and ')} both hold ${type}`,
      message: 'If these hold the same records, edits to one will not show up in the other.',
      fix: 'Keep one owner (the nearest common parent, a store or the query cache) and pass ids or selectors instead.',
      nodes: ids,
    })
  }

  return problems.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

function sameValue(a: PropEdge, b: PropEdge): boolean {
  if (a.data && b.data) return a.data === b.data
  return !a.data && !b.data && a.name === b.name
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/Store$/, '') + 'Store'

export interface CheckedProblems {
  active: Problem[]
  ignored: { problem: Problem; reason: string }[]
}

export function applyIgnores(problems: Problem[], ignore: { rule: string; node?: string; reason: string }[]): CheckedProblems {
  const active: Problem[] = []
  const ignored: CheckedProblems['ignored'] = []
  for (const p of problems) {
    const hit = ignore.find((i) => i.rule === p.rule && (!i.node || p.nodes.includes(i.node)))
    if (hit) ignored.push({ problem: p, reason: hit.reason })
    else active.push(p)
  }
  return { active, ignored }
}
