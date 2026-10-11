import { computeComponentFocus, computeImpact, type Impact } from '../analysis/impact'
import type { Selection } from '../app/flow-store'
import type { Graph } from '../model/graph'
import { parsePath, rootOf } from '../model/paths'
import { isDataNode, type EffectNode } from '../model/schema'
import type { ViewEdge } from './view-edges'

/** How a node relates to the selection. "related" is a neutral neighbour. */
export type NodeRole = 'source' | 'reader' | 'writer' | 'carrier' | 'cascade' | 'related'
export type EdgeRole = 'reader' | 'writer' | 'carrier' | 'cascade' | 'rerender' | 'related'

export interface NodeFocus {
  roles: NodeRole[]
  /** re-renders when the selected data changes */
  rerender: boolean
  /** a memo component the re-render simulation skips */
  skipped: boolean
}

export interface EdgeFocus {
  role: EdgeRole
  /** prop names to print on a tree edge */
  label?: string
}

/** What to light up for a selection. Anything not listed fades to grey. */
export interface FocusView {
  nodes: Map<string, NodeFocus>
  edges: Map<string, EdgeFocus>
  /** present when a data node is selected */
  impact?: Impact
}

class FocusBuilder {
  readonly view: FocusView = { nodes: new Map(), edges: new Map() }

  private node(id: string): NodeFocus {
    let focus = this.view.nodes.get(id)
    if (!focus) {
      focus = { roles: [], rerender: false, skipped: false }
      this.view.nodes.set(id, focus)
    }
    return focus
  }

  role(id: string, role: NodeRole) {
    const { roles } = this.node(id)
    if (!roles.includes(role)) roles.push(role)
  }

  flag(id: string, flag: 'rerender' | 'skipped') {
    this.node(id)[flag] = true
  }

  /** The first role an edge gets wins, so call this in order of importance. */
  edge(edge: ViewEdge, role: EdgeRole, label?: string) {
    if (!this.view.edges.has(edge.id)) this.view.edges.set(edge.id, { role, label: label || undefined })
  }
}

const roots = (paths: string[]) => paths.map(rootOf)

/** Prop names on a tree edge whose engine key passes `wanted`. */
const propLabel = (edge: ViewEdge, wanted: (key: string) => boolean = () => true) =>
  [...new Set(edge.props.filter((_, i) => wanted(edge.keys[i])))].join(', ')

const DIRECT_ROLE = { reads: 'reader', writes: 'writer', mutates: 'writer', derives: 'cascade' } as const

/** Effects that carry a change onwards: triggered by changed data, setting more data. */
function cascadeEffects(g: Graph, impact: Impact): EffectNode[] {
  const changed = new Set([impact.source, ...impact.cascade.keys()])
  return g.effects.filter(
    (e) => roots(e.deps).some((d) => changed.has(d)) && roots(e.sets).some((s) => impact.cascade.has(s)),
  )
}

function impactEdges(b: FocusBuilder, viewEdges: ViewEdge[], impact: Impact, chain: Set<string>) {
  const onRoute = (key: string) => impact.edges.has(key)
  for (const edge of viewEdges) {
    const { kind, source, target } = edge
    if (kind === 'tree') {
      if (edge.keys.some(onRoute)) b.edge(edge, 'carrier', propLabel(edge, onRoute))
      else if (impact.rerenders.has(source) && impact.rerenders.has(target)) b.edge(edge, 'rerender')
    } else if (kind === 'ownership') {
      if (target === impact.source || impact.cascade.has(target) || chain.has(target)) b.edge(edge, 'related')
    } else if (edge.keys.some(onRoute)) {
      b.edge(edge, DIRECT_ROLE[kind])
    } else if (kind === 'writes' && target === impact.source && impact.writers.has(source)) {
      b.edge(edge, 'writer') // an effect that sets the selected data
    } else if (chain.has(source) || chain.has(target)) {
      b.edge(edge, 'cascade')
    }
  }
}

function focusOnData(g: Graph, viewEdges: ViewEdge[], selection: Selection): FocusView {
  const path = [selection.id, ...(selection.fieldPath ? parsePath(selection.fieldPath) : [])]
  const impact = computeImpact(g, path)
  const chain = new Set(cascadeEffects(g, impact).map((e) => e.id))
  const b = new FocusBuilder()

  b.role(impact.source, 'source')
  for (const id of impact.writers.keys()) b.role(id, 'writer')
  for (const id of impact.readers.keys()) b.role(id, 'reader')
  for (const id of impact.carriers.keys()) b.role(id, 'carrier')
  for (const id of [...impact.cascade.keys(), ...chain]) b.role(id, 'cascade')
  for (const id of impact.rerenders.keys()) b.flag(id, 'rerender')
  for (const id of impact.skipped.keys()) b.flag(id, 'skipped')

  impactEdges(b, viewEdges, impact, chain)
  return { ...b.view, impact }
}

function focusOnComponent(g: Graph, viewEdges: ViewEdge[], id: string): FocusView {
  const focus = computeComponentFocus(g, id)
  const b = new FocusBuilder()
  b.role(id, 'source')
  for (const other of [...focus.ancestors, ...focus.children, ...focus.data.keys()]) b.role(other, 'related')

  const lineage = new Set([id, ...focus.ancestors])
  for (const edge of viewEdges) {
    const touches = edge.source === id || edge.target === id
    if (edge.kind === 'tree') {
      if (touches || (lineage.has(edge.source) && lineage.has(edge.target))) b.edge(edge, 'related', propLabel(edge))
    } else if (edge.kind === 'ownership') {
      if (touches) b.edge(edge, 'related')
    } else if (edge.keys.some((key) => focus.edges.has(key))) {
      b.edge(edge, DIRECT_ROLE[edge.kind])
    }
  }
  return b.view
}

function focusOnEffect(viewEdges: ViewEdge[], effect: EffectNode): FocusView {
  const b = new FocusBuilder()
  b.role(effect.id, 'source')
  for (const other of [effect.owner, ...roots(effect.deps), ...roots(effect.sets)]) b.role(other, 'related')
  for (const edge of viewEdges) {
    if (edge.source !== effect.id && edge.target !== effect.id) continue
    b.edge(edge, edge.kind === 'reads' ? 'reader' : edge.kind === 'writes' ? 'writer' : 'related')
  }
  return b.view
}

/** The focus view for the current selection, or null when nothing is selected. */
export function computeFocus(g: Graph, viewEdges: ViewEdge[], selection: Selection | null): FocusView | null {
  const node = selection && g.byId.get(selection.id)
  if (!selection || !node) return null
  if (isDataNode(node)) return focusOnData(g, viewEdges, selection)
  if (node.kind === 'effect') return focusOnEffect(viewEdges, node)
  return focusOnComponent(g, viewEdges, node.id)
}
