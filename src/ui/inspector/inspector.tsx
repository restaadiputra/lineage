import { useState } from 'react'
import { useFlow } from '../app-context'
import { Details } from './details'
import './inspector.css'
import { Problems } from './problems'

const TABS = ['details', 'problems'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = { details: 'Details', problems: 'Problems' }

export function Inspector() {
  const valid = useFlow((s) => s.valid)
  const [tab, setTab] = useState<Tab>('details')
  const problemCount = valid?.problems.active.length ?? 0

  return (
    <>
      <div className="panel__header tabs" role="tablist" aria-label="Inspector">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            className="tab"
            aria-selected={tab === id}
            aria-controls="inspector-panel"
            onClick={() => setTab(id)}
          >
            {LABEL[id]}
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
