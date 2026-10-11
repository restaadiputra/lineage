import type { Graph } from '../model/graph'
import { edgeKey } from '../model/graph'
import { formatPath, overlaps, parsePath, type Path } from '../model/paths'
import type { FlowEdge } from '../model/schema'

export interface Impact {
  source: string
  path: Path
  /** components that use the data (direct read, or a prop they actually use) */
  readers: Map<string, string>
  /** components that receive it as a prop but only pass it on */
  carriers: Map<string, string>
  /** components/effects that change it */
  writers: Map<string, string>
  /** other data that changes as a consequence (effects, derives) */
  cascade: Map<string, string>
  /** components that re-render when it changes, with the reason */
  rerenders: Map<string, string>
  /** memo components that the simulation shows are skipped */
  skipped: Map<string, string>
  /** edge keys on the flow path, for highlighting */
  edges: Set<string>
}

const fullFields = (source: string, fields?: string[]): Path[] | null =>
  fields?.length ? fields.map((f) => [source, ...parsePath(f)]) : null

const touches = (paths: Path[] | null, p: Path) => paths === null || paths.some((q) => overlaps(q, p))

/**
 * What happens when `path` (e.g. ["orders", "[]", "status"]) changes,
 * assuming immutable updates (new references along the path).
 */
export function computeImpact(g: Graph, path: Path): Impact {
  const source = path[0]
  const out: Impact = {
    source,
    path,
    readers: new Map(),
    carriers: new Map(),
    writers: new Map(),
    cascade: new Map(),
    rerenders: new Map(),
    skipped: new Map(),
    edges: new Set(),
  }

  // 1. Readers, carriers, writers of the selected data
  for (const e of g.edgesTo.get(source) ?? []) {
    if ((e.kind === 'writes' || e.kind === 'mutates') && touches(fullFields(source, e.fields), path)) {
      out.writers.set(e.from, e.kind === 'mutates' ? `mutates it in place${e.op ? ` (${e.op})` : ''}` : e.via ? `via ${e.via}` : 'writes it')
      out.edges.add(edgeKey(e))
    }
  }
  for (const eff of g.effects) {
    if (eff.sets.some((s) => overlaps(parsePath(s), path))) out.writers.set(eff.id, `effect sets ${eff.sets.join(', ')}`)
  }
  for (const e of g.edgesFrom.get(source) ?? []) {
    if (e.kind === 'reads' && touches(fullFields(source, e.fields), path)) {
      out.readers.set(e.to, e.fields?.length ? `reads ${e.fields.join(', ')}` : 'reads all of it')
      out.edges.add(edgeKey(e))
    }
  }
  for (const e of g.flow.edges) {
    if (e.kind !== 'prop' || !e.data) continue
    const p = parsePath(e.data)
    if (p[0] !== source || !overlaps(p, path)) continue
    out.edges.add(edgeKey(e))
    const label = `prop ${e.name} = ${e.data}`
    if (e.used === false) {
      if (!out.readers.has(e.to)) out.carriers.set(e.to, `only passes ${e.name} on`)
    } else {
      out.carriers.delete(e.to)
      out.readers.set(e.to, label)
    }
  }

  // 2. Changed data set: the selection plus everything that changes because of it
  const changed: Path[] = [path]
  const queue: Path[] = [path]
  const seenData = new Set<string>([formatPath(path)])
  while (queue.length) {
    const cur = queue.shift()!
    const next: { p: Path; why: string; key?: string }[] = []
    for (const e of g.edgesFrom.get(cur[0]) ?? [])
      if (e.kind === 'derives') next.push({ p: [e.to], why: `derived from ${formatPath(cur)}`, key: edgeKey(e) })
    for (const eff of g.effects)
      if (eff.deps.some((d) => overlaps(parsePath(d), cur)))
        for (const s of eff.sets) next.push({ p: parsePath(s), why: `effect ${eff.id} runs and sets it` })
    for (const n of next) {
      const k = formatPath(n.p)
      if (seenData.has(k)) continue
      seenData.add(k)
      changed.push(n.p)
      queue.push(n.p)
      out.cascade.set(n.p[0], n.why)
      if (n.key) out.edges.add(n.key)
    }
  }

  // 3. Re-render simulation
  const rerender = new Map<string, string>()
  const start = (id: string, why: string) => {
    if (!rerender.has(id)) rerender.set(id, why)
  }
  for (const p of changed) {
    const id = p[0]
    const node = g.byId.get(id)
    if (!node) continue
    if (node.kind === 'state') start(node.owner, `owns ${id}`)
    for (const e of g.edgesFrom.get(id) ?? []) {
      if (e.kind !== 'reads') continue
      const fields = fullFields(id, e.fields)
      if (!touches(fields, p)) continue
      const why =
        node.kind === 'context'
          ? `consumes ${id}`
          : node.kind === 'store'
            ? e.fields?.length
              ? `selects ${e.fields.join(', ')} from ${id}`
              : `subscribes to all of ${id}`
            : `reads ${id}`
      start(e.to, why)
    }
  }

  const propChanged = (e: FlowEdge) =>
    e.kind === 'prop' && !!e.data && changed.some((p) => overlaps(parsePath(e.data!), p))

  const queue2 = [...rerender.keys()]
  while (queue2.length) {
    const parent = queue2.shift()!
    for (const link of g.children.get(parent) ?? []) {
      const child = link.child
      if (rerender.has(child)) continue
      const node = g.byId.get(child)
      if (node?.kind !== 'component') continue
      if (!node.memo) {
        rerender.set(child, `parent ${parent} re-rendered`)
        queue2.push(child)
        continue
      }
      const props = g.propsBetween.get(`${parent}>${child}`) ?? []
      const changedProp = props.find(propChanged)
      const unstable = props.find((p) => p.stable === false)
      if (changedProp) {
        rerender.set(child, `memo, but prop ${changedProp.name} changed`)
        queue2.push(child)
      } else if (unstable) {
        rerender.set(child, `memo, but prop ${unstable.name} is new every render`)
        queue2.push(child)
      } else {
        out.skipped.set(child, 'memo and its props did not change')
      }
    }
  }
  out.rerenders = rerender
  return out
}

/** Summary of a component's own connections, for component focus mode. */
export interface ComponentFocus {
  id: string
  ancestors: Set<string>
  children: Set<string>
  data: Map<string, string>
  edges: Set<string>
}

export function computeComponentFocus(g: Graph, id: string): ComponentFocus {
  const out: ComponentFocus = { id, ancestors: new Set(), children: new Set(), data: new Map(), edges: new Set() }
  let cur = g.parents.get(id)?.[0]
  const guard = new Set([id])
  while (cur && !guard.has(cur)) {
    out.ancestors.add(cur)
    guard.add(cur)
    cur = g.parents.get(cur)?.[0]
  }
  for (const l of g.children.get(id) ?? []) out.children.add(l.child)
  for (const e of g.edgesTo.get(id) ?? []) {
    if (e.kind === 'reads') out.data.set(e.from, 'reads')
    if (e.kind === 'prop' && e.data) out.data.set(parsePath(e.data)[0], `prop ${e.name}`)
    out.edges.add(edgeKey(e))
  }
  for (const e of g.edgesFrom.get(id) ?? []) {
    if (e.kind === 'writes' || e.kind === 'mutates') out.data.set(e.to, e.kind)
    out.edges.add(edgeKey(e))
  }
  for (const n of g.flow.nodes) {
    if ((n.kind === 'state' || n.kind === 'effect') && n.owner === id) out.data.set(n.id, 'owns')
    if (n.kind === 'context' && n.provider === id) out.data.set(n.id, 'provides')
  }
  return out
}
