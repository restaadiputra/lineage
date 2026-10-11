import { useReactFlow } from '@xyflow/react'
import { EDGE_GROUPS, type EdgeGroup } from '../../app/settings'
import { useFlow } from '../app-context'
import { LayoutIcon } from '../shell/icons'
import { fitOptions } from './fit-options'

const LABEL: Record<EdgeGroup, string> = { tree: 'Tree', reads: 'Reads', writes: 'Writes', ownership: 'Ownership' }

/** A short sample of the line style, so the toggles double as the edge legend. */
const LineSample = ({ group }: { group: EdgeGroup }) => (
  <svg className="lg-sample" width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
    <path className="lg-edge__line" data-sample={group} d="M1 4h16" />
    {(group === 'reads' || group === 'writes') && <path className="lg-edge__arrow" d="M18 4l-5-3v6z" />}
  </svg>
)

export function CanvasToolbar({ onRelayout }: { onRelayout(): void }) {
  const filters = useFlow((s) => s.settings.edgeFilters)
  const toggle = useFlow((s) => s.toggleEdgeFilter)
  const { fitView } = useReactFlow()

  return (
    <div className="panel__header canvas-toolbar">
      <div role="group" aria-label="Show edges" className="canvas-toolbar__group">
        {EDGE_GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            className="btn"
            aria-pressed={filters[group]}
            onClick={() => toggle(group)}
          >
            <LineSample group={group} />
            {LABEL[group]}
          </button>
        ))}
      </div>
      <span className="top-bar__spacer" />
      <button
        type="button"
        className="btn"
        title="Zoom out until the whole diagram is in view"
        onClick={() => void fitView(fitOptions())}
      >
        Fit all
      </button>
      <button type="button" className="btn" onClick={onRelayout} title="Discard moved positions and lay out again">
        <LayoutIcon />
        Re-layout
      </button>
    </div>
  )
}
