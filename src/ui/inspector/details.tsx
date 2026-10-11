import type { ValidFlow } from '../../app/analyze'
import { isDataNode } from '../../model/schema'
import { useFlow } from '../app-context'
import { useFocus, useViewEdges } from '../use-focus'
import { ComponentDetails, EffectDetails } from './component-details'
import { DataDetails } from './data-details'
import { ShapeLegend } from './legend'

function NothingSelected() {
  return (
    <>
      <section className="inspector__section">
        <p className="inspector__muted">
          Select a state, context, store or query to see who reads it, who writes it and what re-renders when it
          changes. Select a component to see its props, data, parents and children.
        </p>
      </section>
      <ShapeLegend />
    </>
  )
}

/** The Details tab: one view per node kind. */
export function Details({ valid }: { valid: ValidFlow }) {
  const selection = useFlow((s) => s.selection)
  const viewEdges = useViewEdges(valid.graph)
  const focus = useFocus(valid.graph, viewEdges)
  const node = selection && valid.graph.byId.get(selection.id)

  if (!node || !focus) return <NothingSelected />
  if (isDataNode(node)) return focus.impact ? <DataDetails node={node} valid={valid} impact={focus.impact} /> : null
  if (node.kind === 'effect') return <EffectDetails node={node} />
  return <ComponentDetails node={node} graph={valid.graph} />
}
