import type { Change, DiffStatus, ItemDiff } from '../../analysis/compare'
import { differenceCount, type Comparison } from '../../app/comparison'
import { useFlow } from '../app-context'
import { Section } from './parts'

type Shown = Exclude<DiffStatus, 'same'>

const GROUPS: [status: Shown, title: string, hint: string][] = [
  ['plan-only', 'Only in the plan', 'Planned, but the code does not have it.'],
  ['code-only', 'Only in the code', 'In the code, but not in the plan.'],
  ['changed', 'Changed', 'In both, with different details.'],
]

/** "type: Order[] → Order", or which side has the fact when only one does. */
function ChangeLine({ change }: { change: Change }) {
  const { field, plan, code } = change
  return (
    <li>
      <code>{field}</code>{' '}
      {plan !== null && code !== null && (
        <>
          <code>{plan}</code> in the plan, <code>{code}</code> in the code
        </>
      )}
      {plan !== null && code === null && (
        <>
          <code>{plan}</code>, only in the plan
        </>
      )}
      {plan === null && code !== null && (
        <>
          <code>{code}</code>, only in the code
        </>
      )}
    </li>
  )
}

/** One difference. Picking it selects the node it is about and pans there. */
function DiffItem({ item, kind }: { item: ItemDiff; kind: string }) {
  const reveal = useFlow((s) => s.reveal)
  const target = item.nodes[0]
  return (
    <li>
      {target ? (
        <button type="button" className="link" onClick={() => reveal({ id: target })}>
          {item.label}
        </button>
      ) : (
        <span className="diff__name">{item.label}</span>
      )}
      <span className="rows__why">{kind}</span>
      {item.changes.length > 0 && (
        <ul className="diff__changes">
          {item.changes.map((change) => (
            <ChangeLine key={change.field} change={change} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** The group headings already carry the canvas colors; this explains the marks on lines. */
function DiffLegend() {
  return (
    <Section title="On the diagram">
      <p className="inspector__muted">
        Nodes that differ are tagged in words. On a line between two components: <code>+</code> a prop only the code
        passes, <code>−</code> one only the plan passes, <code>~</code> one that differs.
      </p>
    </Section>
  )
}

/** The Compare tab: every difference between the plan and the code, by kind of difference. */
export function Compare({ comparison }: { comparison: Comparison }) {
  const { diff, fileName, notes } = comparison
  const all: [kind: string, item: ItemDiff][] = [
    ...diff.nodes.map((item): [string, ItemDiff] => ['node', item]),
    ...diff.edges.map((item): [string, ItemDiff] => ['edge', item]),
    ...diff.types.map((item): [string, ItemDiff] => ['type', item]),
  ]

  return (
    <>
      <section className="inspector__section">
        <p>
          The plan is the flow in the editor. The code is <code>{fileName}</code>.
        </p>
        {differenceCount(diff) === 0 && <p className="inspector__muted">They describe the same flow.</p>}
      </section>
      {GROUPS.map(([status, title, hint]) => {
        const group = all.filter(([, item]) => item.status === status)
        if (group.length === 0) return null
        return (
          <Section key={status} title={title} count={group.length} swatch={{ 'data-diff': status }}>
            <p className="inspector__muted diff__hint">{hint}</p>
            <ul className="rows">
              {group.map(([kind, item]) => (
                <DiffItem key={`${kind}:${item.key}`} item={item} kind={kind} />
              ))}
            </ul>
          </Section>
        )
      })}
      {notes.length > 0 && (
        <Section title="Not read from the code" count={notes.length}>
          <p className="inspector__muted diff__hint">
            The reader works from the source text without AI. Differences that involve these may not be real.
          </p>
          <ul className="diff__changes">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Section>
      )}
      <DiffLegend />
    </>
  )
}

/** For the Details tab: how the selected node differs, shown above its details. */
export function NodeDifference({ item }: { item: ItemDiff | undefined }) {
  if (!item || item.status === 'same') return null
  const title = { 'plan-only': 'Only in the plan', 'code-only': 'Only in the code', changed: 'Differs in the code' }[item.status]
  return (
    <Section title={title} swatch={{ 'data-diff': item.status }}>
      {item.changes.length > 0 && (
        <ul className="diff__changes">
          {item.changes.map((change) => (
            <ChangeLine key={change.field} change={change} />
          ))}
        </ul>
      )}
    </Section>
  )
}
