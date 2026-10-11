import { useState } from 'react'
import type { CheckedProblems, Problem, Severity } from '../../analysis/rules'
import { Section } from './parts'
import { ProblemItem } from './problem-item'

const GROUPS: [severity: Severity, title: string][] = [
  ['error', 'Errors'],
  ['warning', 'Warnings'],
  ['info', 'Notes'],
]

const keyOf = (problem: Problem) => `${problem.rule}:${problem.nodes.join('>')}:${problem.title}`

function IgnoredList({ ignored }: { ignored: CheckedProblems['ignored'] }) {
  if (ignored.length === 0) return null
  return (
    <details className="inspector__section ignored">
      <summary>Ignored ({ignored.length})</summary>
      <ul className="rows">
        {ignored.map(({ problem, reason }) => (
          <li key={keyOf(problem)}>
            <span>{problem.title}</span>
            <span className="rows__why">{reason}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** The Problems tab: rule findings by severity, then what the team chose to ignore. */
export function Problems({ problems }: { problems: CheckedProblems }) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  return (
    <>
      {problems.active.length === 0 && (
        <section className="inspector__section">
          <p className="inspector__muted">No problems found. The design follows every rule Lineage checks.</p>
        </section>
      )}
      {GROUPS.map(([severity, title]) => {
        const group = problems.active.filter((p) => p.severity === severity)
        if (group.length === 0) return null
        return (
          <Section key={severity} title={title} count={group.length}>
            <ul className="problems">
              {group.map((problem) => {
                const key = keyOf(problem)
                return (
                  <ProblemItem
                    key={key}
                    problem={problem}
                    open={openKey === key}
                    onToggle={() => setOpenKey(openKey === key ? null : key)}
                  />
                )
              })}
            </ul>
          </Section>
        )
      })}
      <IgnoredList ignored={problems.ignored} />
    </>
  )
}
