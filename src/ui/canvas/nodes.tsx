import type { NodeProps } from '@xyflow/react'
import { kindWord, visibleProps } from '../../canvas/node-size'
import { isDataNode } from '../../model/schema'
import type { CanvasNode } from './canvas-model'
import { NodeFrame } from './node-frame'

/** Rectangle: name, then up to six props in mono. */
export function ComponentNodeView({ data }: NodeProps<CanvasNode>) {
  const { node } = data
  if (node.kind !== 'component') return null
  const { shown, hidden } = visibleProps(node)

  return (
    <NodeFrame data={data} shape="component">
      <div className="lg-node__head">
        <span className="lg-node__name">{node.id}</span>
        {node.memo && <span className="lg-node__kind">memo</span>}
      </div>
      {shown.length > 0 && (
        <ul className="lg-node__props">
          {shown.map(([name, type]) => (
            <li key={name}>
              {name}
              <span className="lg-node__type">: {type}</span>
            </li>
          ))}
          {hidden > 0 && <li className="lg-node__type">+{hidden} more</li>}
        </ul>
      )}
    </NodeFrame>
  )
}

/** State, context, store or query: the outline tells them apart (see canvas.css). */
export function DataNodeView({ data }: NodeProps<CanvasNode>) {
  const { node } = data
  if (!isDataNode(node)) return null

  return (
    <NodeFrame data={data} shape={node.kind}>
      <div className="lg-node__head">
        <span className="lg-node__name">{node.id}</span>
        <span className="lg-node__kind">{kindWord(node)}</span>
      </div>
      <div className="lg-node__type lg-node__line">{node.type}</div>
    </NodeFrame>
  )
}

/** Small tag. */
export function EffectNodeView({ data }: NodeProps<CanvasNode>) {
  return (
    <NodeFrame data={data} shape="effect">
      <span className="lg-node__kind">effect</span>
      <span className="lg-node__name">{data.node.id}</span>
    </NodeFrame>
  )
}

