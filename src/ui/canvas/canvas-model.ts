import type { Edge, Node } from '@xyflow/react'
import type { DiffStatus, FlowDiff } from '../../analysis/compare'
import type { ValidFlow } from '../../app/analyze'
import type { Positions } from '../../app/position-repository'
import type { Settings } from '../../app/settings'
import { problemBadges, type Badge } from '../../canvas/badges'
import { edgeDiffView, nodeDiffStatus } from '../../canvas/diff-view'
import type { EdgeFocus, FocusView, NodeFocus } from '../../canvas/focus'
import { sizeOf } from '../../canvas/node-size'
import type { ViewEdge, ViewEdgeKind } from '../../canvas/view-edges'
import type { FlowNode } from '../../model/schema'

/** A difference worth drawing; "same" is drawn as nothing. */
export type ShownDiff = Exclude<DiffStatus, 'same'>

export interface CanvasNodeData extends Record<string, unknown> {
  node: FlowNode
  /** null when nothing is selected, or when this node is outside the focus */
  focus: NodeFocus | null
  /** a selection exists and this node is not part of it */
  dimmed: boolean
  badge: Badge | null
  /** while comparing plan and code: how this node differs */
  diff: ShownDiff | null
}
export type CanvasNode = Node<CanvasNodeData>

export interface CanvasEdgeData extends Record<string, unknown> {
  kind: ViewEdgeKind
  focus: EdgeFocus | null
  dimmed: boolean
  diff: ShownDiff | null
  /** text printed on the line: prop names on a lit route, or the props that differ */
  label: string | undefined
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

const shown = (status: DiffStatus): ShownDiff | null => (status === 'same' ? null : status)

interface NodeInputs {
  valid: ValidFlow
  positions: Positions
  focus: FocusView | null
  selectedId: string | undefined
  /** set while comparing; the focus view is off then */
  diff?: FlowDiff | null
}

export function buildCanvasNodes({ valid, positions, focus, selectedId, diff }: NodeInputs): CanvasNode[] {
  const badges = problemBadges(valid.problems.active)
  return valid.flow.nodes.map((node) => {
    const nodeFocus = focus?.nodes.get(node.id) ?? null
    return {
      id: node.id,
      type: NODE_TYPE[node.kind],
      position: positions[node.id] ?? { x: 0, y: 0 },
      ...sizeOf(node),
      selected: node.id === selectedId,
      data: {
        node,
        focus: nodeFocus,
        dimmed: !!focus && !nodeFocus,
        badge: badges.get(node.id) ?? null,
        diff: diff ? shown(nodeDiffStatus(diff, node.id)) : null,
      },
    }
  })
}

interface EdgeInputs {
  viewEdges: ViewEdge[]
  focus: FocusView | null
  filters: Settings['edgeFilters']
  diff?: FlowDiff | null
}

export function buildCanvasEdges({ viewEdges, focus, filters, diff }: EdgeInputs): CanvasEdge[] {
  return viewEdges
    .filter((edge) => filters[edge.group])
    .map((edge) => {
      const edgeFocus = focus?.edges.get(edge.id) ?? null
      const difference = diff ? edgeDiffView(edge, diff) : null
      const edgeDiff = difference ? shown(difference.status) : null
      return {
        id: edge.id,
        type: 'flow',
        source: edge.source,
        target: edge.target,
        focusable: false,
        selectable: false,
        // Lit routes and differences are drawn above the grey lines.
        zIndex: edgeFocus || edgeDiff ? 1 : 0,
        data: {
          kind: edge.kind,
          focus: edgeFocus,
          dimmed: !!focus && !edgeFocus,
          diff: edgeDiff,
          label: edgeFocus?.label ?? difference?.label,
        },
      }
    })
}
