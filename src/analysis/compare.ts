import { edgeKey } from '../model/graph'
import { rootOf } from '../model/paths'
import type { FlowEdge, FlowFile, FlowNode } from '../model/schema'

/**
 * Plan versus code: what differs between two flow files. "Plan" is the flow
 * being edited; "code" is a second file, usually written by an AI from the
 * real code. Where a node comes from in the code (`source`, `note`) is not a
 * difference: plans do not have it.
 */
export type DiffStatus = 'same' | 'plan-only' | 'code-only' | 'changed'

/** One fact that differs. Null means that side does not have it. */
export interface Change {
  field: string
  plan: string | null
  code: string | null
}

export interface ItemDiff {
  /** node id, type name, or the id of the canvas edge it is drawn as */
  key: string
  /** how to name it in a list: "orders" or "reads uiStore → Header" */
  label: string
  status: DiffStatus
  changes: Change[]
  /** nodes to show when this item is picked, most relevant first */
  nodes: string[]
}

export interface FlowDiff {
  nodes: ItemDiff[]
  edges: ItemDiff[]
  types: ItemDiff[]
  /** nodes and edges by key */
  byKey: Map<string, ItemDiff>
  /** how many items have each status, over nodes, edges and types */
  counts: Record<DiffStatus, number>
}

/** Comparable facts about an item: field name → value as text. Absent fields are simply left out. */
type Facts = Record<string, string>

interface Item {
  key: string
  label: string
  facts: Facts
  nodes: string[]
}

const put = (facts: Facts, field: string, value: string | boolean | undefined) => {
  if (value === undefined || value === false) return
  facts[field] = value === true ? 'yes' : value
}

function nodeFacts(node: FlowNode): Facts {
  const facts: Facts = { kind: node.kind }
  switch (node.kind) {
    case 'component':
      put(facts, 'memo', node.memo)
      for (const [name, type] of Object.entries(node.props ?? {})) put(facts, `props.${name}`, type)
      break
    case 'state':
      put(facts, 'owner', node.owner)
      put(facts, 'hook', node.hook)
      break
    case 'context':
      put(facts, 'provider', node.provider)
      // `stable: false` is a real claim about the code; leaving it out is not.
      if (node.stable !== undefined) facts.stable = node.stable ? 'yes' : 'no'
      break
    case 'store':
      put(facts, 'library', node.library)
      break
    case 'query':
      put(facts, 'library', node.library)
      put(facts, 'key', node.key)
      break
    case 'effect':
      put(facts, 'owner', node.owner)
      put(facts, 'external', node.external)
      break
  }
  if ('type' in node) put(facts, 'type', node.type)
  if ('updates' in node) put(facts, 'updates', node.updates)
  return facts
}

const fieldList = (fields: string[] | undefined) => (fields?.length ? [...fields].sort().join(', ') : undefined)

function edgeFacts(edge: FlowEdge): Facts {
  const facts: Facts = {}
  switch (edge.kind) {
    case 'reads':
      put(facts, 'fields', fieldList(edge.fields))
      put(facts, 'as', edge.as)
      break
    case 'prop':
      put(facts, 'data', edge.data)
      if (edge.used === false) facts.used = 'no'
      if (edge.stable !== undefined) facts.stable = edge.stable ? 'yes' : 'no'
      put(facts, 'callback', edge.callback)
      break
    case 'writes':
      put(facts, 'via', edge.via)
      put(facts, 'fields', fieldList(edge.fields))
      break
    case 'mutates':
      put(facts, 'op', edge.op)
      put(facts, 'fields', fieldList(edge.fields))
      break
    case 'derives':
      put(facts, 'via', edge.via)
      break
  }
  return facts
}

const edgeLabel = (edge: FlowEdge) =>
  edge.kind === 'prop' ? `prop ${edge.name}: ${edge.from} → ${edge.to}` : `${edge.kind} ${edge.from} → ${edge.to}`

/**
 * Every edge-like thing in a flow, keyed the way the canvas draws it: explicit
 * edges, parent → child render links, and the deps and sets of effects.
 * Exported so merging two flows uses exactly the same identity.
 */
export function edgeItems(flow: FlowFile): Item[] {
  const items = new Map<string, Item>()
  const add = (item: Item) => {
    // Two edges with the same endpoints (two writes) get distinct keys.
    let key = item.key
    for (let n = 2; items.has(key); n++) key = `${item.key}#${n}`
    items.set(key, { ...item, key })
  }

  for (const edge of flow.edges) add({ key: edgeKey(edge), label: edgeLabel(edge), facts: edgeFacts(edge), nodes: [edge.to, edge.from] })

  for (const node of flow.nodes) {
    if (node.kind === 'component') {
      for (const link of node.renders ?? []) {
        const child = typeof link === 'string' ? { id: link } : link
        const facts: Facts = {}
        put(facts, 'list key', child.list?.key)
        put(facts, 'when', child.when)
        add({ key: `tree:${node.id}>${child.id}`, label: `renders ${node.id} → ${child.id}`, facts, nodes: [child.id, node.id] })
      }
    }
    if (node.kind === 'effect') {
      const byRoot = (paths: string[]) => {
        const groups = new Map<string, string[]>()
        for (const path of paths) groups.set(rootOf(path), [...(groups.get(rootOf(path)) ?? []), path])
        return groups
      }
      for (const [root, paths] of byRoot(node.deps)) {
        const key = `reads:${root}>${node.id}`
        if (!items.has(key)) add({ key, label: `depends on ${root} → ${node.id}`, facts: { paths: paths.join(', ') }, nodes: [node.id, root] })
      }
      for (const [root, paths] of byRoot(node.sets)) {
        const key = `writes:${node.id}>${root}`
        if (!items.has(key)) add({ key, label: `sets ${node.id} → ${root}`, facts: { paths: paths.join(', ') }, nodes: [node.id, root] })
      }
    }
  }
  return [...items.values()]
}

function typeItems(flow: FlowFile): Item[] {
  return Object.entries(flow.types).map(([name, definition]) => ({
    key: name,
    label: name,
    facts: typeof definition === 'string' ? { '': definition } : definition,
    nodes: [],
  }))
}

function changesBetween(plan: Facts, code: Facts): Change[] {
  const fields = [...new Set([...Object.keys(plan), ...Object.keys(code)])]
  return fields
    .filter((field) => plan[field] !== code[field])
    .map((field) => ({ field: field || 'definition', plan: plan[field] ?? null, code: code[field] ?? null }))
}

/** Pair items by key: plan order first, then what only the code has. */
function pair(planItems: Item[], codeItems: Item[]): ItemDiff[] {
  const inCode = new Map(codeItems.map((item) => [item.key, item]))
  const inPlan = new Set(planItems.map((item) => item.key))
  const fromPlan = planItems.map((item): ItemDiff => {
    const other = inCode.get(item.key)
    const { key, label, nodes } = item
    if (!other) return { key, label, nodes, status: 'plan-only', changes: [] }
    const changes = changesBetween(item.facts, other.facts)
    return { key, label, nodes, status: changes.length ? 'changed' : 'same', changes }
  })
  const fromCode = codeItems
    .filter((item) => !inPlan.has(item.key))
    .map(({ key, label, nodes }): ItemDiff => ({ key, label, nodes, status: 'code-only', changes: [] }))
  return [...fromPlan, ...fromCode]
}

const nodeItems = (flow: FlowFile): Item[] =>
  flow.nodes.map((node) => ({ key: node.id, label: node.id, facts: nodeFacts(node), nodes: [node.id] }))

export function compareFlows(plan: FlowFile, code: FlowFile): FlowDiff {
  const nodes = pair(nodeItems(plan), nodeItems(code))
  const edges = pair(edgeItems(plan), edgeItems(code))
  const types = pair(typeItems(plan), typeItems(code))

  const counts: Record<DiffStatus, number> = { same: 0, 'plan-only': 0, 'code-only': 0, changed: 0 }
  for (const item of [...nodes, ...edges, ...types]) counts[item.status] += 1
  return { nodes, edges, types, counts, byKey: new Map([...nodes, ...edges].map((item) => [item.key, item])) }
}

const childId = (link: string | { id: string }) => (typeof link === 'string' ? link : link.id)

/** A plan node widened with what only the code version has, so those links can be drawn too. */
function widen(planNode: FlowNode, codeNode: FlowNode | undefined): FlowNode {
  if (planNode.kind === 'component' && codeNode?.kind === 'component') {
    const known = new Set((planNode.renders ?? []).map(childId))
    const extra = (codeNode.renders ?? []).filter((link) => !known.has(childId(link)))
    return extra.length ? { ...planNode, renders: [...(planNode.renders ?? []), ...extra] } : planNode
  }
  if (planNode.kind === 'effect' && codeNode?.kind === 'effect') {
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]
    return { ...planNode, deps: union(planNode.deps, codeNode.deps), sets: union(planNode.sets, codeNode.sets) }
  }
  return planNode
}

/**
 * The union of two flows, for drawing both in one diagram. Where both have a
 * node the plan's version is shown; a diff says how the code's differs.
 */
export function mergeFlows(plan: FlowFile, code: FlowFile): FlowFile {
  const codeNodes = new Map(code.nodes.map((node) => [node.id, node]))
  const planIds = new Set(plan.nodes.map((node) => node.id))
  const planEdgeKeys = new Set(plan.edges.map(edgeKey))
  return {
    ...plan,
    types: { ...code.types, ...plan.types },
    nodes: [...plan.nodes.map((node) => widen(node, codeNodes.get(node.id))), ...code.nodes.filter((node) => !planIds.has(node.id))],
    edges: [...plan.edges, ...code.edges.filter((edge) => !planEdgeKeys.has(edgeKey(edge)))],
  }
}
