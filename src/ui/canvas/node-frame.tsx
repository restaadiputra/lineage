import { Handle, Position } from '@xyflow/react'
import type { ReactNode } from 'react'
import { DIFF_WORD } from '../../canvas/diff-view'
import type { CanvasNodeData } from './canvas-model'

interface NodeFrameProps {
  data: CanvasNodeData
  /** picks the outline that encodes the node kind */
  shape: string
  children: ReactNode
}

const SEVERITY_WORD = { error: 'error', warning: 'warning', info: 'note' } as const

/**
 * The part every node shares: focus state as data attributes (styled in
 * canvas.css), the problem badge, and the two anchor points edges attach to.
 */
export function NodeFrame({ data, shape, children }: NodeFrameProps) {
  const { focus, dimmed, badge, diff } = data
  const roles = focus?.roles ?? []

  return (
    <div
      className={`lg-node lg-node--${shape}`}
      data-roles={roles.join(' ') || undefined}
      data-rerender={focus?.rerender || undefined}
      data-skipped={focus?.skipped || undefined}
      data-dimmed={dimmed || undefined}
      data-diff={diff ?? undefined}
    >
      {/* Edges compute their own endpoints; React Flow still needs a handle on each end. */}
      <Handle type="target" position={Position.Top} isConnectable={false} className="lg-handle" />
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="lg-handle" />
      {children}
      {/* In words as well as color, so the difference does not depend on telling hues apart. */}
      {diff && <span className="lg-node__tag">{DIFF_WORD[diff]}</span>}
      {roles.length > 1 && (
        <span className="lg-node__pips" aria-hidden="true">
          {roles.map((role) => (
            <span key={role} className="lg-pip" data-role={role} />
          ))}
        </span>
      )}
      {badge && (
        <span
          className="lg-badge"
          data-severity={badge.severity}
          title={`${badge.count} ${badge.count === 1 ? 'problem' : 'problems'}, worst: ${SEVERITY_WORD[badge.severity]}`}
        >
          {badge.count}
        </span>
      )}
    </div>
  )
}
