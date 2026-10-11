import type { Edge, Node } from '@xyflow/react'
import type { ValidFlow } from '../../app/analyze'
import type { Positions } from '../../app/position-repository'
import type { Settings } from '../../app/settings'
import { problemBadges, type Badge } from '../../canvas/badges'
import type { EdgeFocus, FocusView, NodeFocus } from '../../canvas/focus'
import { sizeOf } from '../../canvas/node-size'
import type { ViewEdge, ViewEdgeKind } from '../../canvas/view-edges'
import type { FlowNode } from '../../model/schema'

export interface CanvasNodeData extends Record<string, unknown> {
  node: FlowNode
  /** null when nothing is selected, or when this node is outside the focus */
  focus: NodeFocus | null
  /** a selection exists and this node is not part of it */
  dimmed: boolean
  badge: Badge | null
}
export type CanvasNode = Node<CanvasNodeData>

export interface CanvasEdgeData extends Record<string, unknown> {
  kind: ViewEdgeKind
  focus: EdgeFocus | null
  dimmed: boolean
}
export type CanvasEdge = Edge<CanvasEdgeData>

const NODE_TYPE: Record<FlowNode['kind'], string> = {
  component: 'component',
  effect: 'effect',
  state: 'data',
  context: 'data',
  store: 'data',
  query: 'data',
}

interface NodeInputs {
  valid: ValidFlow
  positions: Positions
  focus: FocusView | null
  selectedId: string | undefined
}

export function buildCanvasNodes({ valid, positions, focus, selectedId }: NodeInputs): CanvasNode[] {
  const badges = problemBadges(valid.problems.active)
  return valid.flow.nodes.map((node) => {
    const nodeFocus = focus?.nodes.get(node.id) ?? null
    return {
      id: node.id,
      type: NODE_TYPE[node.kind],
      position: positions[node.id] ?? { x: 0, y: 0 },
      ...sizeOf(node),
      selected: node.id === selectedId,
      data: { node, focus: nodeFocus, dimmed: !!focus && !nodeFocus, badge: badges.get(node.id) ?? null },
    }
  })
}

export function buildCanvasEdges(
  viewEdges: ViewEdge[],
  focus: FocusView | null,
  filters: Settings['edgeFilters'],
): CanvasEdge[] {
  return viewEdges
    .filter((edge) => filters[edge.group])
    .map((edge) => {
      const edgeFocus = focus?.edges.get(edge.id) ?? null
      return {
        id: edge.id,
        type: 'flow',
        source: edge.source,
        target: edge.target,
        focusable: false,
        selectable: false,
        // Lit routes are drawn above the grey ones.
        zIndex: edgeFocus ? 1 : 0,
        data: { kind: edge.kind, focus: edgeFocus, dimmed: !!focus && !edgeFocus },
      }
    })
}
