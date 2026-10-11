import { useState, type FormEvent } from 'react'
import { RULES, type Problem } from '../../analysis/rules'
import { useFlow } from '../app-context'
import { NodeLink } from './parts'

const ruleName = (id: string) => RULES.find((r) => r.id === id)?.name ?? id

/** Inline form that records why a problem is accepted. */
function IgnoreForm({ problem, onDone }: { problem: Problem; onDone(): void }) {
  const ignoreProblem = useFlow((s) => s.ignoreProblem)
  const notify = useFlow((s) => s.notify)
  const [reason, setReason] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) return
    ignoreProblem({ rule: problem.rule, node: problem.nodes[0], reason: reason.trim() })
    notify('Added to the ignore list in the YAML')
    onDone()
  }

  return (
    <form className="ignore-form" onSubmit={submit}>
      <label>
        <span className="inspector__muted">Why is this acceptable here?</span>
        <input
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason, kept in the file"
          autoFocus
        />
      </label>
      <div className="ignore-form__actions">
        <button type="submit" className="btn btn--outline" disabled={!reason.trim()}>
          Ignore
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function ProblemBody({ problem }: { problem: Problem }) {
  const [ignoring, setIgnoring] = useState(false)
  return (
    <div className="problem__body">
      <p>{problem.message}</p>
      <p>
        <span className="problem__fix">Fix</span> {problem.fix}
      </p>
      {problem.codeLevel && (
        <p className="inspector__muted">Relies on code-level facts; check them if this diagram is a plan.</p>
      )}
      <p className="problem__nodes">
        {problem.nodes.map((id) => (
          <NodeLink key={id} id={id} />
        ))}
      </p>
      {ignoring ? (
        <IgnoreForm problem={problem} onDone={() => setIgnoring(false)} />
      ) : (
        <button type="button" className="btn btn--outline" onClick={() => setIgnoring(true)}>
          Ignore…
        </button>
      )}
    </div>
  )
}

interface ProblemItemProps {
  problem: Problem
  open: boolean
  onToggle(): void
}

/** One problem: the title selects its node and pans to it, and opens the explanation. */
export function ProblemItem({ problem, open, onToggle }: ProblemItemProps) {
  const reveal = useFlow((s) => s.reveal)
  const activate = () => {
    if (problem.nodes[0]) reveal({ id: problem.nodes[0] })
    onToggle()
  }

  return (
    <li className="problem" data-severity={problem.severity}>
      <button type="button" className="problem__head" aria-expanded={open} onClick={activate}>
        <span className="problem__mark" aria-hidden="true" />
        <span>
          <span className="problem__title">{problem.title}</span>
          <span className="problem__rule">{ruleName(problem.rule)}</span>
        </span>
      </button>
      {open && <ProblemBody problem={problem} />}
    </li>
  )
}
