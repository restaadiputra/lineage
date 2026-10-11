import { FlowEdge } from './flow-edge'
import { ComponentNodeView, DataNodeView, EffectNodeView } from './nodes'

/** Renderers React Flow looks up by a node's or edge's `type`. */
export const nodeTypes = { component: ComponentNodeView, data: DataNodeView, effect: EffectNodeView }
export const edgeTypes = { flow: FlowEdge }
