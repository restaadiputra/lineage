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
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import type { ValidFlow } from '../../app/analyze'
import type { Rect } from '../../canvas/edge-geometry'
import { sizeOf } from '../../canvas/node-size'
import { boundsOf, READABLE_ZOOM, readableViewport } from '../../canvas/viewport'
import { useFlow, useServices } from '../app-context'
import { useFocus, useShownFlow, useViewEdges } from '../use-focus'
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

/**
 * Frame the diagram each time it was laid out afresh. Works from our own
 * positions and sizes, so it does not depend on React Flow having measured yet.
 */
function useFrameOnLayout(layoutId: number, rects: Rect[] | null, container: RefObject<HTMLDivElement | null>) {
  const { setViewport } = useReactFlow()
  const latest = useRef(rects)
  useEffect(() => {
    latest.current = rects
  })
  const ready = rects !== null

  useEffect(() => {
    const bounds = boundsOf(latest.current ?? [])
    const view = container.current?.getBoundingClientRect()
    if (!ready || !bounds || !view) return
    void setViewport(readableViewport(bounds, view), { duration: fitOptions().duration })
  }, [layoutId, ready, container, setViewport])
}

/** Pan to the selected node whenever something asks to reveal it (a problem, a search result, a link). */
function useRevealSelection(nodeCount: number) {
  const { store } = useServices()
  const revealToken = useFlow((s) => s.revealToken)
  const { getInternalNode, getZoom, setCenter } = useReactFlow()
  const handled = useRef(0)
  useEffect(() => {
    const id = store.getState().selection?.id
    const node = id ? getInternalNode(id) : undefined
    // A node that was just added is not on the canvas yet: wait until it is (nodeCount changes).
    if (revealToken === handled.current || !node) return
    handled.current = revealToken
    const { x, y } = node.internals.positionAbsolute
    const center = { x: x + (node.measured.width ?? 0) / 2, y: y + (node.measured.height ?? 0) / 2 }
    // Keep the user's zoom unless the text would be too small to read.
    void setCenter(center.x, center.y, { zoom: Math.max(getZoom(), READABLE_ZOOM), duration: fitOptions().duration })
  }, [revealToken, nodeCount, store, getInternalNode, getZoom, setCenter])
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

  const comparison = useFlow((s) => s.comparison)
  const diff = comparison?.diff ?? null

  const viewEdges = useViewEdges(valid.graph)
  const impactFocus = useFocus(valid.graph, viewEdges)
  // While comparing, color means "differs"; the impact view would compete with it.
  const focus = diff ? null : impactFocus
  // A comparison gets its own arrangement, so the plan's saved positions are left alone.
  const positionsKey = comparison ? `${valid.flow.name} ⇄ ${comparison.fileName}` : valid.flow.name
  const layoutNodes = useMemo(() => valid.flow.nodes.map((n) => ({ id: n.id, ...sizeOf(n) })), [valid.flow])
  const layoutEdges = useMemo(() => viewEdges.filter((e) => e.inLayout), [viewEdges])
  const { positions, layoutId, relayout, commitMoves } = usePositions(positionsKey, layoutNodes, layoutEdges)

  const model = useMemo(
    () => (positions ? buildCanvasNodes({ valid, positions, focus, selectedId, diff }) : []),
    [valid, positions, focus, selectedId, diff],
  )
  const edges = useMemo(
    () => buildCanvasEdges({ viewEdges, focus, filters, diff, positions }),
    [viewEdges, focus, filters, diff, positions],
  )
  const { nodes, onNodesChange } = useSyncedNodes(model)
  const container = useRef<HTMLDivElement>(null)
  const rects = useMemo(
    () => positions && layoutNodes.filter((n) => positions[n.id]).map((n) => ({ ...positions[n.id], width: n.width, height: n.height })),
    [positions, layoutNodes],
  )
  useFrameOnLayout(layoutId, rects, container)
  useRevealSelection(nodes.length)

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
      <div className="canvas" ref={container} data-focused={focus ? true : undefined} data-comparing={diff ? true : undefined}>
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
  const valid = useShownFlow()
  const openDialog = useFlow((s) => s.openDialog)
  if (!valid) {
    return (
      <p className="canvas-empty">
        Nothing to draw yet. Fix the errors in the YAML and the diagram appears here.
      </p>
    )
  }
  if (valid.flow.nodes.length === 0) {
    return (
      <div className="canvas-empty">
        <p>
          This flow has no nodes yet. Add the first one here, write them under <code>nodes:</code> in the YAML, or use
          Ask AI to have your assistant write the file from your code.
        </p>
        <button type="button" className="btn btn--outline" onClick={() => openDialog('add-node')}>
          Add a node
          <kbd>N</kbd>
        </button>
      </div>
    )
  }
  return (
    <ReactFlowProvider>
      <Diagram valid={valid} />
    </ReactFlowProvider>
  )
}
