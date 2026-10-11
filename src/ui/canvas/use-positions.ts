import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Point, Positions } from '../../app/position-repository'
import { layoutGraph, type LayoutEdge, type LayoutNode } from '../../canvas/layout'
import { useFlow, useServices } from '../app-context'

interface PositionState {
  flowName: string
  positions: Positions
  /** changes whenever the whole diagram was laid out afresh, so the view can re-fit */
  layoutId: number
  /** the store's positionsRevision these positions were read at */
  revision: number
}

export interface NodeMove {
  id: string
  position: Point
}

const pick = (positions: Positions, nodes: LayoutNode[]): Positions =>
  Object.fromEntries(nodes.filter((n) => positions[n.id]).map((n) => [n.id, positions[n.id]]))

/**
 * Node positions for a flow: saved ones first, auto-layout for the rest.
 * Positions are null until the first layout finishes.
 */
export function usePositions(flowName: string, nodes: LayoutNode[], edges: LayoutEdge[]) {
  const { positions: repository } = useServices()
  // Bumped when a layout file replaced the saved positions.
  const revision = useFlow((s) => s.positionsRevision)
  const [state, setState] = useState<PositionState | null>(null)
  // Async callbacks read the newest inputs and state through this ref.
  const latest = useRef({ flowName, nodes, edges, state, revision })
  useEffect(() => {
    latest.current = { flowName, nodes, edges, state, revision }
  })

  // Re-run only when the set of nodes or their sizes change, not on every parse.
  const signature = useMemo(
    () => [flowName, ...nodes.map((n) => `${n.id}:${n.width}x${n.height}`)].join('|'),
    [flowName, nodes],
  )

  const place = useCallback(
    async (keepSaved: boolean, isCurrent: () => boolean) => {
      const { flowName, nodes, edges, revision } = latest.current
      const saved = keepSaved ? pick(repository.load(flowName), nodes) : {}
      const complete = nodes.every((n) => saved[n.id])
      const auto = complete ? {} : await layoutGraph(nodes, edges)
      if (!isCurrent()) return
      const positions = { ...auto, ...saved }
      repository.save(flowName, positions)
      setState((prev) => {
        // Small edits to the same flow keep the view; a new flow, a re-layout or an imported layout re-frames it.
        const sameView = !!prev && prev.flowName === flowName && prev.revision === revision && keepSaved
        return { flowName, positions, revision, layoutId: sameView ? prev.layoutId : (prev?.layoutId ?? 0) + 1 }
      })
    },
    [repository],
  )

  useEffect(() => {
    let current = true
    void place(true, () => current)
    return () => {
      current = false
    }
  }, [signature, revision, place])

  /** Forget saved positions and lay everything out again. */
  const relayout = useCallback(() => void place(false, () => true), [place])

  /** Record where the user dropped nodes. */
  const commitMoves = useCallback(
    (moves: NodeMove[]) => {
      const prev = latest.current.state
      if (!prev) return
      const positions = { ...prev.positions }
      for (const { id, position } of moves) positions[id] = position
      repository.save(prev.flowName, positions)
      setState({ ...prev, positions })
    },
    [repository],
  )

  // Positions of a previous flow must not leak onto a newly opened one.
  const ready = state?.flowName === flowName
  return { positions: ready ? state.positions : null, layoutId: state?.layoutId ?? 0, relayout, commitMoves }
}
