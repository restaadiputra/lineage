import { useEffect } from 'react'
import type { Severity } from '../../analysis/rules'
import { useFlow } from '../app-context'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const SEVERITIES: [severity: Severity, word: string][] = [
  ['error', 'error'],
  ['warning', 'warning'],
  ['info', 'note'],
]

const NOTICE_MS = 4000

/** The latest confirmation ("Saved orders.flow.yaml"), cleared after a few seconds. */
function Notice() {
  const notice = useFlow((s) => s.notice)
  const notify = useFlow((s) => s.notify)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => notify(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice, notify])
  return <span className="status-bar__notice">{notice}</span>
}

export function StatusBar() {
  const valid = useFlow((s) => s.valid)
  const diagnostics = useFlow((s) => s.diagnostics)

  const yamlErrors = diagnostics.filter((d) => d.severity === 'error').length
  const counts = SEVERITIES.map(([severity, word]) => ({
    severity,
    word,
    count: valid?.problems.active.filter((p) => p.severity === severity).length ?? 0,
  })).filter((entry) => entry.count > 0)

  return (
    <footer className="status-bar" role="status">
      {yamlErrors > 0 ? (
        <span className="status-bar__state" data-severity="error">
          {plural(yamlErrors, 'YAML error')}
          {valid && ', showing the last valid diagram'}
        </span>
      ) : (
        <span className="status-bar__state">Valid</span>
      )}
      {valid && (
        <>
          <span>{plural(valid.flow.nodes.length, 'node')}</span>
          <span>{plural(valid.flow.edges.length, 'edge')}</span>
          {counts.map(({ severity, word, count }) => (
            <span key={severity} data-severity={severity}>
              {plural(count, word)}
            </span>
          ))}
        </>
      )}
      <Notice />
    </footer>
  )
}
