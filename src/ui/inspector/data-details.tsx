import type { Impact } from '../../analysis/impact'
import type { ValidFlow } from '../../app/analyze'
import { kindWord } from '../../canvas/node-size'
import { formatPath } from '../../model/paths'
import type { DataNode } from '../../model/schema'
import { FieldTree } from './field-tree'
import { Fact, NodeLink, NodeSummary, ReasonRows, Section } from './parts'

/** The impact lists. Each heading carries the swatch used on the canvas, so this doubles as the legend. */
function ImpactLists({ impact }: { impact: Impact }) {
  const groups: [title: string, swatch: Record<string, string | boolean>, rows: Map<string, string>][] = [
    ['Reads it', { 'data-roles': 'reader' }, impact.readers],
    ['Writes it', { 'data-roles': 'writer' }, impact.writers],
    ['Only passes it on', { 'data-roles': 'carrier' }, impact.carriers],
    ['Changes as a result', { 'data-roles': 'cascade' }, impact.cascade],
    ['Re-renders', { 'data-rerender': true }, impact.rerenders],
    ['Skipped by memo', { 'data-skipped': true }, impact.skipped],
  ]
  return (
    <>
      {groups.map(([title, swatch, rows]) => (
        <Section key={title} title={title} swatch={swatch} count={rows.size}>
          <ReasonRows rows={rows} />
        </Section>
      ))}
    </>
  )
}

interface DataDetailsProps {
  node: DataNode
  valid: ValidFlow
  impact: Impact
}

export function DataDetails({ node, valid, impact }: DataDetailsProps) {
  const owner = valid.graph.ownerOf.get(node.id)
  return (
    <>
      <NodeSummary node={node} kind={kindWord(node)}>
        <p className="mono">{node.type}</p>
        {owner && (
          <Fact label={node.kind === 'context' ? 'Provided by' : 'Owned by'}>
            <NodeLink id={owner} />
          </Fact>
        )}
        {node.kind === 'query' && node.key && (
          <Fact label="Key">
            <code>{node.key}</code>
          </Fact>
        )}
        {node.updates && <Fact label="Updates">{node.updates}</Fact>}
      </NodeSummary>
      <FieldTree node={node} types={valid.flow.types} />
      <Section title="When this changes" swatch={{ 'data-roles': 'source' }}>
        <p className="mono">{formatPath(impact.path)}</p>
      </Section>
      <ImpactLists impact={impact} />
    </>
  )
}
