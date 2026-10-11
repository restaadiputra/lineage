import { useMemo } from 'react'
import type { ValidFlow } from '../app/analyze'
import { computeFocus, type FocusView } from '../canvas/focus'
import { buildViewEdges, type ViewEdge } from '../canvas/view-edges'
import type { Graph } from '../model/graph'
import { useFlow } from './app-context'

export function useViewEdges(graph: Graph): ViewEdge[] {
  return useMemo(() => buildViewEdges(graph), [graph])
}

/** The focus view for the current selection; null when nothing is selected. */
export function useFocus(graph: Graph, viewEdges: ViewEdge[]): FocusView | null {
  const selection = useFlow((s) => s.selection)
  return useMemo(() => computeFocus(graph, viewEdges, selection), [graph, viewEdges, selection])
}

/**
 * The flow the canvas and inspector show: the open flow, or while comparing,
 * the open flow merged with the code's flow so nodes from both can be drawn.
 */
export function useShownFlow(): ValidFlow | null {
  const valid = useFlow((s) => s.valid)
  const merged = useFlow((s) => s.comparison?.merged)
  return useMemo(() => (valid && merged ? { ...valid, ...merged } : valid), [valid, merged])
}
