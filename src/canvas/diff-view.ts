import type { DiffStatus, FlowDiff } from '../analysis/compare'
import type { ViewEdge } from './view-edges'

/** What the tag on a node or the legend calls each status. */
export const DIFF_WORD: Record<Exclude<DiffStatus, 'same'>, string> = {
  'plan-only': 'plan only',
  'code-only': 'code only',
  changed: 'changed',
}

/** Marks used in edge labels, explained by the legend in the Compare tab. */
const MARK: Record<Exclude<DiffStatus, 'same'>, string> = { 'plan-only': '−', 'code-only': '+', changed: '~' }

export interface EdgeDiffView {
  status: DiffStatus
  /** for a parent → child line: the props that differ, e.g. "+onSearch ~title" */
  label?: string
}

export const nodeDiffStatus = (diff: FlowDiff, id: string): DiffStatus => diff.byKey.get(id)?.status ?? 'same'

const statusOf = (diff: FlowDiff, key: string): DiffStatus => diff.byKey.get(key)?.status ?? 'same'

/** A parent → child line stands for the render link and every prop between the two. */
function treeEdgeDiff(edge: ViewEdge, diff: FlowDiff): EdgeDiffView {
  const link = statusOf(diff, edge.id)
  if (link === 'plan-only' || link === 'code-only') return { status: link }

  const marks = edge.keys.flatMap((key, index) => {
    const status = statusOf(diff, key)
    return status === 'same' ? [] : [`${MARK[status]}${edge.props[index]}`]
  })
  if (marks.length) return { status: 'changed', label: marks.join(' ') }
  return { status: link }
}

/** An ownership line has no entry of its own: it follows the node it leads to. */
function ownershipEdgeDiff(edge: ViewEdge, diff: FlowDiff): EdgeDiffView {
  const owned = diff.byKey.get(edge.target)
  if (!owned || owned.status === 'same') return { status: 'same' }
  if (owned.status !== 'changed') return { status: owned.status }
  const moved = owned.changes.some((change) => change.field === 'owner' || change.field === 'provider')
  return { status: moved ? 'changed' : 'same' }
}

/** How a line on the canvas differs between plan and code. */
export function edgeDiffView(edge: ViewEdge, diff: FlowDiff): EdgeDiffView {
  if (edge.kind === 'tree') return treeEdgeDiff(edge, diff)
  if (edge.kind === 'ownership') return ownershipEdgeDiff(edge, diff)
  return { status: statusOf(diff, edge.id) }
}
