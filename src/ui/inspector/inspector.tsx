import type { KeyboardEvent } from 'react'
import type { InspectorTab } from '../../app/flow-store'
import { useFlow } from '../app-context'
import { useShownFlow } from '../use-focus'
import { Compare } from './compare'
import { Details } from './details'
import './inspector.css'
import { Problems } from './problems'

const LABEL: Record<InspectorTab, string> = { details: 'Details', problems: 'Problems', compare: 'Compare' }

/** The tab an arrow, Home or End key moves to; undefined for any other key. */
function tabForKey(tabs: InspectorTab[], current: InspectorTab, key: string): InspectorTab | undefined {
  const index = tabs.indexOf(current)
  const target = {
    ArrowRight: (index + 1) % tabs.length,
    ArrowLeft: (index - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  }[key]
  return target === undefined ? undefined : tabs[target]
}

export function Inspector() {
  const valid = useFlow((s) => s.valid)
  const shown = useShownFlow()
  const comparison = useFlow((s) => s.comparison)
  const tab = useFlow((s) => s.inspectorTab)
  const setTab = useFlow((s) => s.setInspectorTab)
  const problemCount = valid?.problems.active.length ?? 0
  // The Compare tab exists only while a comparison is running.
  const tabs: InspectorTab[] = comparison ? ['details', 'problems', 'compare'] : ['details', 'problems']

  // Standard tab pattern: one tab stop for the list, arrow keys move between tabs.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = tabForKey(tabs, tab, event.key)
    if (!next) return
    event.preventDefault()
    setTab(next)
    event.currentTarget.querySelector<HTMLElement>(`#tab-${next}`)?.focus()
  }

  return (
    <>
      <div className="panel__header tabs" role="tablist" aria-label="Inspector" onKeyDown={onKeyDown}>
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            className="tab"
            aria-selected={tab === id}
            aria-controls="inspector-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {/* The trailing space keeps the accessible name "Problems 11", not "Problems11". */}
            {LABEL[id]}{' '}
            {id === 'problems' && problemCount > 0 && <span className="inspector__count">{problemCount}</span>}
          </button>
        ))}
      </div>
      <div className="panel__body" role="tabpanel" id="inspector-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'details' && shown && <Details valid={shown} />}
        {tab === 'problems' && valid && <Problems problems={valid.problems} />}
        {tab === 'compare' && comparison && <Compare comparison={comparison} />}
      </div>
    </>
  )
}
