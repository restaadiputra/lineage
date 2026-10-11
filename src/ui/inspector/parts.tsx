import type { ReactNode } from 'react'
import type { FlowNode } from '../../model/schema'
import { useFlow, useServices } from '../app-context'

interface SectionProps {
  title: string
  count?: number
  /** a miniature node drawn before the title, making the section its own legend entry */
  swatch?: Record<string, string | boolean>
  children?: ReactNode
}

export function Section({ title, count, swatch, children }: SectionProps) {
  return (
    <section className="inspector__section" data-empty={count === 0 || undefined}>
      <h3 className="inspector__label">
        {swatch && <span className="lg-node legend__swatch" {...swatch} />}
        {/* The trailing space keeps the accessible name "Reads it 3", not "Reads it3". */}
        <span>{title}</span>{' '}
        {count !== undefined && <span className="inspector__count">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** A node name that selects the node and pans the canvas to it. */
export function NodeLink({ id }: { id: string }) {
  const reveal = useFlow((s) => s.reveal)
  return (
    <button type="button" className="link" onClick={() => reveal({ id })}>
      {id}
    </button>
  )
}

/** Node → explanation rows, e.g. readers with what they read. */
export function ReasonRows({ rows }: { rows: Iterable<[id: string, reason: ReactNode]> }) {
  const list = [...rows]
  if (list.length === 0) return null
  return (
    <ul className="rows">
      {list.map(([id, reason], index) => (
        // The same node can appear twice (two writes to one state), so the id alone is not a key.
        <li key={`${id}:${index}`}>
          <NodeLink id={id} />
          <span className="rows__why">{reason}</span>
        </li>
      ))}
    </ul>
  )
}

/** `source` as written in the file, with a button to copy it for the editor's go-to-file. */
function SourceLine({ source }: { source: string }) {
  const { clipboard, host } = useServices()
  const notify = useFlow((s) => s.notify)
  const copy = () =>
    clipboard.copy(source).then(
      () => notify('Source copied'),
      () => notify('Could not copy: clipboard access was blocked'),
    )

  return (
    <p className="source">
      <code>{source}</code>
      {host.openSource && (
        <button type="button" className="btn btn--small" onClick={() => host.openSource?.(source)}>
          Open
        </button>
      )}
      <button type="button" className="btn btn--small" onClick={() => void copy()}>
        Copy
      </button>
    </p>
  )
}

/** Name, kind and the facts every node kind shares. */
export function NodeSummary({ node, kind, children }: { node: FlowNode; kind: string; children?: ReactNode }) {
  return (
    <section className="inspector__section">
      <h2 className="inspector__title">{node.id}</h2>
      <p className="inspector__muted">{kind}</p>
      {children}
      {node.note && <p className="inspector__note">{node.note}</p>}
      {node.source && <SourceLine source={node.source} />}
    </section>
  )
}

/** A label–value line in a summary. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="fact">
      <span className="inspector__muted">{label}</span>
      <span>{children}</span>
    </p>
  )
}
