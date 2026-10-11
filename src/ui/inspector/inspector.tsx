import { useState, type KeyboardEvent } from 'react'
import { useFlow } from '../app-context'
import { Details } from './details'
import './inspector.css'
import { Problems } from './problems'

const TABS = ['details', 'problems'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = { details: 'Details', problems: 'Problems' }

/** The tab an arrow, Home or End key moves to; undefined for any other key. */
function tabForKey(current: Tab, key: string): Tab | undefined {
  const index = TABS.indexOf(current)
  const target = {
    ArrowRight: (index + 1) % TABS.length,
    ArrowLeft: (index - 1 + TABS.length) % TABS.length,
    Home: 0,
    End: TABS.length - 1,
  }[key]
  return target === undefined ? undefined : TABS[target]
}

export function Inspector() {
  const valid = useFlow((s) => s.valid)
  const [tab, setTab] = useState<Tab>('details')
  const problemCount = valid?.problems.active.length ?? 0

  // Standard tab pattern: one tab stop for the list, arrow keys move between tabs.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = tabForKey(tab, event.key)
    if (!next) return
    event.preventDefault()
    setTab(next)
    event.currentTarget.querySelector<HTMLElement>(`#tab-${next}`)?.focus()
  }

  return (
    <>
      <div className="panel__header tabs" role="tablist" aria-label="Inspector" onKeyDown={onKeyDown}>
        {TABS.map((id) => (
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
        {valid && (tab === 'details' ? <Details valid={valid} /> : <Problems problems={valid.problems} />)}
      </div>
    </>
  )
}
