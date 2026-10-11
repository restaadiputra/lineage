import type { EdgeGroup } from '../app/settings'
import { edgeKey, type Graph } from '../model/graph'
import { rootOf } from '../model/paths'

export type ViewEdgeKind = 'tree' | 'ownership' | 'reads' | 'writes' | 'mutates' | 'derives'

/** One line on the canvas. Several flow edges can share a line (all props of a parent→child pair). */
export interface ViewEdge {
  id: string
  kind: ViewEdgeKind
  /** which filter toggle shows or hides it */
  group: EdgeGroup
  source: string
  target: string
  /** whether the auto-layout follows this edge */
  inLayout: boolean
  /** engine edge keys (see edgeKey) this line stands for */
  keys: string[]
  /** prop names carried along a tree edge, parallel to `keys` */
  props: string[]
}

const GROUP: Record<ViewEdgeKind, EdgeGroup> = {
  tree: 'tree',
  ownership: 'ownership',
  reads: 'reads',
  writes: 'writes',
  mutates: 'writes',
  derives: 'writes',
}

/** Writes point up the tree against the layout direction, so the layout ignores them. */
const IN_LAYOUT: Record<ViewEdgeKind, boolean> = {
  tree: true,
  ownership: true,
  reads: true,
  derives: true,
  writes: false,
  mutates: false,
}

class EdgeSet {
  private readonly edges = new Map<string, ViewEdge>()

  /** Adds a line, or returns the existing one with the same id. */
  add(kind: ViewEdgeKind, source: string, target: string): ViewEdge {
    const id = edgeKey({ kind, from: source, to: target })
    let edge = this.edges.get(id)
    if (!edge) {
      edge = { id, kind, group: GROUP[kind], source, target, inLayout: IN_LAYOUT[kind], keys: [], props: [] }
      this.edges.set(id, edge)
    }
    return edge
  }

  list(): ViewEdge[] {
    return [...this.edges.values()]
  }
}

function addTreeEdges(g: Graph, edges: EdgeSet) {
  for (const links of g.children.values()) for (const link of links) edges.add('tree', link.parent, link.child)
  // Props between a pair ride on that pair's tree edge (and create it if `renders` forgot the child).
  for (const props of g.propsBetween.values()) {
    for (const prop of props) {
      const edge = edges.add('tree', prop.from, prop.to)
      edge.keys.push(edgeKey(prop))
      edge.props.push(prop.name)
    }
  }
}

function addOwnershipEdges(g: Graph, edges: EdgeSet) {
  for (const node of g.flow.nodes) {
    if (node.kind === 'state' || node.kind === 'effect') edges.add('ownership', node.owner, node.id)
    if (node.kind === 'context') edges.add('ownership', node.provider, node.id)
  }
}

function addDataEdges(g: Graph, edges: EdgeSet) {
  for (const e of g.flow.edges) {
    if (e.kind === 'prop') continue
    edges.add(e.kind, e.from, e.to).keys.push(edgeKey(e))
  }
  // Effects have no edges in the file: their deps and sets are the edges.
  for (const effect of g.effects) {
    for (const dep of effect.deps) edges.add('reads', rootOf(dep), effect.id)
    for (const set of effect.sets) edges.add('writes', effect.id, rootOf(set))
  }
}

/** Every line the canvas can draw for a graph. */
export function buildViewEdges(g: Graph): ViewEdge[] {
  const edges = new EdgeSet()
  addTreeEdges(g, edges)
  addOwnershipEdges(g, edges)
  addDataEdges(g, edges)
  // Guard against edges to ids the graph does not have (the parser reports those).
  return edges.list().filter((e) => g.byId.has(e.source) && g.byId.has(e.target))
}
