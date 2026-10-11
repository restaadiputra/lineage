import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useCallback, useEffect, useMemo } from 'react'
import type { ValidFlow } from '../../app/analyze'
import { sizeOf } from '../../canvas/node-size'
import { useFlow, useServices } from '../app-context'
import { useFocus, useViewEdges } from '../use-focus'
import './canvas.css'
import { buildCanvasEdges, buildCanvasNodes, type CanvasNode } from './canvas-model'
import { CanvasToolbar } from './canvas-toolbar'
import { fitOptions } from './fit-options'
import { edgeTypes, nodeTypes } from './canvas-types'
import { usePositions, type NodeMove } from './use-positions'

/** React Flow keeps its own copy of the nodes (it adds measurements); this feeds ours into it. */
function useSyncedNodes(model: CanvasNode[]) {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([])
  useEffect(() => {
    setNodes((previous) => {
      const known = new Map(previous.map((n) => [n.id, n]))
      return model.map((n) => ({ ...known.get(n.id), ...n }))
    })
  }, [model, setNodes])
  return { nodes, onNodesChange }
}

/** Fit the view each time the diagram was laid out afresh. */
function useFitOnLayout(layoutId: number, ready: boolean) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (!ready) return
    const frame = requestAnimationFrame(() => void fitView(fitOptions()))
    return () => cancelAnimationFrame(frame)
  }, [layoutId, ready, fitView])
}

/** Pan to the selected node whenever something asks to reveal it (a problem, a search result, a link). */
function useRevealSelection() {
  const { store } = useServices()
  const revealToken = useFlow((s) => s.revealToken)
  const { getInternalNode, getZoom, setCenter } = useReactFlow()
  useEffect(() => {
    const id = store.getState().selection?.id
    const node = id ? getInternalNode(id) : undefined
    if (revealToken === 0 || !node) return
    const { x, y } = node.internals.positionAbsolute
    const center = { x: x + (node.measured.width ?? 0) / 2, y: y + (node.measured.height ?? 0) / 2 }
    // Keep the user's zoom unless the text would be too small to read.
    void setCenter(center.x, center.y, { zoom: Math.max(getZoom(), 0.8), duration: fitOptions().duration })
  }, [revealToken, store, getInternalNode, getZoom, setCenter])
}

/** Node ids React Flow just selected / deselected, and nodes the user finished dragging. */
function readChanges(changes: NodeChange<CanvasNode>[]) {
  const selected: string[] = []
  const deselected: string[] = []
  const moves: NodeMove[] = []
  for (const change of changes) {
    if (change.type === 'select') (change.selected ? selected : deselected).push(change.id)
    if (change.type === 'position' && change.dragging === false && change.position)
      moves.push({ id: change.id, position: change.position })
  }
  return { selected, deselected, moves }
}

function Diagram({ valid }: { valid: ValidFlow }) {
  const selectedId = useFlow((s) => s.selection?.id)
  const select = useFlow((s) => s.select)
  const filters = useFlow((s) => s.settings.edgeFilters)

  const viewEdges = useViewEdges(valid.graph)
  const focus = useFocus(valid.graph, viewEdges)
  const layoutNodes = useMemo(() => valid.flow.nodes.map((n) => ({ id: n.id, ...sizeOf(n) })), [valid.flow])
  const layoutEdges = useMemo(() => viewEdges.filter((e) => e.inLayout), [viewEdges])
  const { positions, layoutId, relayout, commitMoves } = usePositions(valid.flow.name, layoutNodes, layoutEdges)

  const model = useMemo(
    () => (positions ? buildCanvasNodes({ valid, positions, focus, selectedId }) : []),
    [valid, positions, focus, selectedId],
  )
  const edges = useMemo(() => buildCanvasEdges(viewEdges, focus, filters), [viewEdges, focus, filters])
  const { nodes, onNodesChange } = useSyncedNodes(model)
  useFitOnLayout(layoutId, nodes.length > 0)
  useRevealSelection()

  const handleNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      onNodesChange(changes)
      const { selected, deselected, moves } = readChanges(changes)
      if (selected.length) select({ id: selected[0] })
      else if (selectedId && deselected.includes(selectedId)) select(null)
      if (moves.length) commitMoves(moves)
    },
    [onNodesChange, select, selectedId, commitMoves],
  )

  return (
    <>
      <CanvasToolbar onRelayout={relayout} />
      <div className="canvas" data-focused={focus ? true : undefined}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          nodesConnectable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--hairline)" bgColor="var(--canvas)" />
        </ReactFlow>
      </div>
    </>
  )
}

export function FlowCanvas() {
  const valid = useFlow((s) => s.valid)
  if (!valid) {
    return (
      <p className="canvas-empty">
        Nothing to draw yet. Fix the errors in the YAML and the diagram appears here.
      </p>
    )
  }
  return (
    <ReactFlowProvider>
      <Diagram valid={valid} />
    </ReactFlowProvider>
  )
}
