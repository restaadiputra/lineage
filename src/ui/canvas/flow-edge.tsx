import { EdgeLabelRenderer, getBezierPath, Position, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react'
import { arrowPath, connect, shiftAlongSide, type Rect, type Side } from '../../canvas/edge-geometry'
import type { ViewEdgeKind } from '../../canvas/view-edges'
import type { CanvasEdge } from './canvas-model'

const POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

/** Kinds that point at something; tree and ownership lines are plain. */
const HAS_ARROW: Record<ViewEdgeKind, boolean> = {
  tree: false,
  ownership: false,
  reads: true,
  writes: true,
  mutates: true,
  derives: true,
}

/** Writes run beside reads between the same two nodes instead of on top of them. */
const WRITE_OFFSET = 9

const rectOf = (node: InternalNode): Rect => ({
  ...node.internals.positionAbsolute,
  width: node.measured.width ?? node.width ?? 0,
  height: node.measured.height ?? node.height ?? 0,
})

function endpoints(kind: ViewEdgeKind, source: InternalNode, target: InternalNode) {
  const { from, to } = connect(rectOf(source), rectOf(target))
  if (kind !== 'writes' && kind !== 'mutates') return { from, to }
  return { from: shiftAlongSide(from, WRITE_OFFSET), to: shiftAlongSide(to, WRITE_OFFSET) }
}

/** An edge that attaches to whichever sides of its two nodes face each other. */
export function FlowEdge({ source, target, data }: EdgeProps<CanvasEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode || !data) return null

  const { from, to } = endpoints(data.kind, sourceNode, targetNode)
  const [path, labelX, labelY] = getBezierPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: POSITION[from.side],
    targetX: to.x,
    targetY: to.y,
    targetPosition: POSITION[to.side],
  })
  const { label } = data

  return (
    <g
      className="lg-edge"
      data-kind={data.kind}
      data-role={data.focus?.role}
      data-dimmed={data.dimmed || undefined}
      data-diff={data.diff ?? undefined}
    >
      <path className="lg-edge__line" d={path} />
      {HAS_ARROW[data.kind] && <path className="lg-edge__arrow" d={arrowPath(to)} />}
      {label && (
        <EdgeLabelRenderer>
          <span
            className="lg-edge-label"
            data-role={data.focus?.role}
            data-diff={data.diff ?? undefined}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}

