import type { Graph, RenderLink } from '../model/graph'
import type { FlowEdge, FlowNode, PropEdge, ReadsEdge } from '../model/schema'

type WriteEdge = Extract<FlowEdge, { kind: 'writes' | 'mutates' }>

/** A component's own connections, gathered for the inspector. */
export interface ComponentDetails {
  parents: string[]
  children: RenderLink[]
  /** props it is given, one per parent that passes it */
  received: PropEdge[]
  reads: ReadsEdge[]
  writes: WriteEdge[]
  /** state, context and effects that live in it */
  owns: FlowNode[]
}

export function describeComponent(g: Graph, id: string): ComponentDetails {
  const outgoing = g.edgesFrom.get(id) ?? []
  const incoming = g.edgesTo.get(id) ?? []
  return {
    parents: g.parents.get(id) ?? [],
    children: g.children.get(id) ?? [],
    received: g.propsInto.get(id) ?? [],
    reads: incoming.filter((e): e is ReadsEdge => e.kind === 'reads'),
    writes: outgoing.filter((e): e is WriteEdge => e.kind === 'writes' || e.kind === 'mutates'),
    owns: g.flow.nodes.filter(
      (n) => ((n.kind === 'state' || n.kind === 'effect') && n.owner === id) || (n.kind === 'context' && n.provider === id),
    ),
  }
}
