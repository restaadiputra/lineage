import type { ReactNode } from 'react'
import { describeComponent } from '../../app/describe-component'
import type { Graph, RenderLink } from '../../model/graph'
import type { ComponentNode, EffectNode, PropEdge } from '../../model/schema'
import { Fact, NodeLink, NodeSummary, ReasonRows, Section } from './parts'

const Path = ({ children }: { children: ReactNode }) => <code>{children}</code>

/** What a received prop is: its data, and the facts the rules care about. */
function propFacts(prop: PropEdge): string {
  const facts = [
    prop.callback && 'callback',
    prop.used === false && 'only passed on',
    prop.stable === false && 'new every render',
  ].filter(Boolean)
  return facts.join(', ')
}

function ReceivedProps({ props }: { props: PropEdge[] }) {
  return (
    <Section title="Receives" count={props.length}>
      {props.length > 0 && (
        <ul className="rows">
          {props.map((prop) => (
            <li key={`${prop.from}:${prop.name}`}>
              <span>
                <Path>{prop.name}</Path> from <NodeLink id={prop.from} />
              </span>
              <span className="rows__why">
                {prop.data && <Path>{prop.data}</Path>}
                {prop.data && propFacts(prop) && ' · '}
                {propFacts(prop)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

const childNote = (link: RenderLink) =>
  [link.isList && `list, key ${link.listKey ?? 'missing'}`, link.when && `when ${link.when}`].filter(Boolean).join(' · ')

export function ComponentDetails({ node, graph }: { node: ComponentNode; graph: Graph }) {
  const details = describeComponent(graph, node.id)
  const declared = Object.entries(node.props ?? {})

  return (
    <>
      <NodeSummary node={node} kind={node.memo ? 'component, memo' : 'component'} />
      <Section title="Props" count={declared.length}>
        {declared.length > 0 && (
          <ul className="rows rows--mono">
            {declared.map(([name, type]) => (
              <li key={name}>
                <span>{name}</span>
                <span className="rows__why">{type}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <ReceivedProps props={details.received} />
      <Section title="Reads" count={details.reads.length}>
        <ReasonRows rows={details.reads.map((e) => [e.from, e.fields?.length ? <Path key="fields">{e.fields.join(', ')}</Path> : 'all of it'])} />
      </Section>
      <Section title="Writes" count={details.writes.length}>
        <ReasonRows
          rows={details.writes.map((e) => [e.to, e.kind === 'mutates' ? `mutates in place${e.op ? `: ${e.op}` : ''}` : (e.via ?? '')])}
        />
      </Section>
      <Section title="Owns" count={details.owns.length}>
        <ReasonRows rows={details.owns.map((n) => [n.id, n.kind])} />
      </Section>
      <Section title="Children" count={details.children.length}>
        <ReasonRows rows={details.children.map((link) => [link.child, childNote(link)])} />
      </Section>
      <Section title="Parents" count={details.parents.length}>
        <ReasonRows rows={details.parents.map((id) => [id, ''])} />
      </Section>
    </>
  )
}

export function EffectDetails({ node }: { node: EffectNode }) {
  return (
    <>
      <NodeSummary node={node} kind={node.external ? 'effect, talks to something outside React' : 'effect'}>
        <Fact label="Owned by">
          <NodeLink id={node.owner} />
        </Fact>
      </NodeSummary>
      <Section title="Depends on" count={node.deps.length}>
        <ul className="rows rows--mono">
          {node.deps.map((dep) => (
            <li key={dep}>{dep}</li>
          ))}
        </ul>
      </Section>
      <Section title="Sets" count={node.sets.length}>
        <ul className="rows rows--mono">
          {node.sets.map((set) => (
            <li key={set}>{set}</li>
          ))}
        </ul>
      </Section>
    </>
  )
}
