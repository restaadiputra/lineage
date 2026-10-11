import { useMemo } from 'react'
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
