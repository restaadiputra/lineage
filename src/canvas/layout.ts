import type { ElkNode } from 'elkjs/lib/elk-api'
import type { Positions } from '../app/position-repository'
import type { Size } from './node-size'

export interface LayoutNode extends Size {
  id: string
}

export interface LayoutEdge {
  id: string
  source: string
  target: string
}

const OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '28',
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  // Keep siblings in the order the file lists them, so the drawing reads like the YAML.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
}

/** Layered top-down layout. Returns the top-left position of every node. */
export async function layoutGraph(nodes: LayoutNode[], edges: LayoutEdge[]): Promise<Positions> {
  // ELK is by far the largest dependency; load it only when a layout is needed.
  const { default: Elk } = await import('elkjs/lib/elk.bundled.js')
  const root: ElkNode = {
    id: 'root',
    layoutOptions: OPTIONS,
    children: nodes.map(({ id, width, height }) => ({ id, width, height })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  }
  const result = await new Elk().layout(root)
  return Object.fromEntries((result.children ?? []).map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
}
