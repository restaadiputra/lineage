import type { Graph } from '../model/graph'
import { isDescendant } from '../model/graph'
import { rootOf } from '../model/paths'
import { isDataNode, type FlowNode } from '../model/schema'
import type { FlowEdit } from './edit-flow'

/** One way two nodes can be connected, as a sentence the user picks. */
export interface Relation {
  key: string
  /** "OrdersPage renders Toast" */
  sentence: string
  /** an extra value the relation needs, e.g. the name of a prop */
  input?: { label: string; placeholder: string }
  edits(input: string): FlowEdit[]
}

const hasEdge = (g: Graph, kind: string, from: string, to: string) =>
  (g.edgesFrom.get(from) ?? []).some((e) => e.kind === kind && e.to === to)

const renders = (g: Graph, parent: string, child: string) => (g.children.get(parent) ?? []).some((link) => link.child === child)

function componentToComponent(g: Graph, parent: string, child: string): Relation[] {
  // Rendering an ancestor (or itself) would make the tree a loop.
  if (parent === child || isDescendant(g, parent, child)) return []
  const link: FlowEdit = { type: 'list', nodeId: parent, list: 'renders', value: child }
  const linked = renders(g, parent, child)
  const relations: Relation[] = []
  if (!linked) relations.push({ key: `renders:${parent}>${child}`, sentence: `${parent} renders ${child}`, edits: () => [link] })
  relations.push({
    key: `prop:${parent}>${child}`,
    sentence: `${parent} passes a prop to ${child}`,
    input: { label: 'Prop name', placeholder: 'onSelect' },
    // A prop only makes sense on a rendered child, so the render link comes with it.
    edits: (name) => [...(linked ? [] : [link]), { type: 'edge', edge: { kind: 'prop', from: parent, to: child, name: name.trim() } }],
  })
  return relations
}

/** Relations that go from `a` to `b`. Called once for each direction. */
function directed(g: Graph, a: FlowNode, b: FlowNode): Relation[] {
  const edge = (kind: string, from: string, to: string, sentence: string): Relation[] =>
    hasEdge(g, kind, from, to) ? [] : [{ key: `${kind}:${from}>${to}`, sentence, edits: () => [{ type: 'edge', edge: { kind, from, to } }] }]

  if (a.kind === 'component' && b.kind === 'component') return componentToComponent(g, a.id, b.id)
  if (isDataNode(a) && b.kind === 'component') return edge('reads', a.id, b.id, `${b.id} reads ${a.id}`)
  if (a.kind === 'component' && isDataNode(b)) return edge('writes', a.id, b.id, `${a.id} writes ${b.id}`)
  if (isDataNode(a) && isDataNode(b) && a.id !== b.id) return edge('derives', a.id, b.id, `${b.id} is derived from ${a.id}`)

  if (isDataNode(a) && b.kind === 'effect' && !b.deps.some((dep) => rootOf(dep) === a.id))
    return [{ key: `deps:${a.id}>${b.id}`, sentence: `${b.id} depends on ${a.id}`, edits: () => [{ type: 'list', nodeId: b.id, list: 'deps', value: a.id }] }]
  if (a.kind === 'effect' && isDataNode(b) && !a.sets.some((set) => rootOf(set) === b.id))
    return [{ key: `sets:${a.id}>${b.id}`, sentence: `${a.id} sets ${b.id}`, edits: () => [{ type: 'list', nodeId: a.id, list: 'sets', value: b.id }] }]
  return []
}

/**
 * Every way to connect two nodes that the flow does not already have, in
 * either direction. Empty when the kinds cannot be connected (an effect and a
 * component, say: an effect belongs to its owner and that is all).
 */
export function relationsBetween(g: Graph, first: string, second: string): Relation[] {
  const a = g.byId.get(first)
  const b = g.byId.get(second)
  if (!a || !b || first === second) return []
  // Reading is the common case, so it is offered first whichever node was selected.
  const readsFirst = (relation: Relation) => (/^(reads|deps):/.test(relation.key) ? 0 : 1)
  return [...directed(g, a, b), ...directed(g, b, a)].sort((x, y) => readsFirst(x) - readsFirst(y))
}
