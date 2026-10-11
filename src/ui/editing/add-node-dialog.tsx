import { useState, type FormEvent } from 'react'
import { draftProblem, editsForNewNode, NODE_FIELDS, type NodeDraft, type NodeKind } from '../../app/edit-flow'
import type { Graph } from '../../model/graph'
import { useFlow, useServices } from '../app-context'
import { Modal } from '../shell/modal'
import './editing.css'

const KINDS: [kind: NodeKind, label: string][] = [
  ['component', 'Component'],
  ['state', 'State'],
  ['context', 'Context'],
  ['store', 'Store'],
  ['query', 'Query'],
  ['effect', 'Effect'],
]

function AddNodeForm({ graph, onClose }: { graph: Graph; onClose(): void }) {
  const { store } = useServices()
  const components = graph.flow.nodes.filter((n) => n.kind === 'component').map((n) => n.id)
  // A selected component is the likely parent or owner of what is being added.
  const selected = store.getState().selection?.id
  const nearby = selected && components.includes(selected) ? selected : ''

  const [draft, setDraft] = useState<NodeDraft>({
    kind: 'component',
    id: '',
    owner: nearby || components[0] || '',
    type: '',
    renderedBy: nearby,
  })
  const [error, setError] = useState<string | null>(null)
  const fields = NODE_FIELDS[draft.kind]
  const change = (patch: Partial<NodeDraft>) => {
    setDraft({ ...draft, ...patch })
    setError(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const problem = draftProblem(draft, graph)
    if (problem) return setError(problem)
    if (!store.getState().applyEdits(editsForNewNode(draft))) return setError(store.getState().notice)
    onClose()
    store.getState().reveal({ id: draft.id.trim() })
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2 className="form__title">Add a node</h2>
      <fieldset className="form__choices">
        <legend>Kind</legend>
        {KINDS.map(([kind, label]) => (
          <label key={kind} className="form__choice">
            <input type="radio" name="kind" checked={draft.kind === kind} onChange={() => change({ kind })} />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="form__field">
        Id
        <input
          className="input mono"
          value={draft.id}
          onChange={(event) => change({ id: event.target.value })}
          placeholder={draft.kind === 'component' ? 'OrderList' : 'orders'}
          data-autofocus
        />
      </label>
      {fields.owner && (
        <label className="form__field">
          {draft.kind === 'context' ? 'Provided by' : 'Owned by'}
          <select className="input" value={draft.owner} onChange={(event) => change({ owner: event.target.value })}>
            {components.length === 0 && <option value="">Add a component first</option>}
            {components.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
      )}
      {fields.type && (
        <label className="form__field">
          Type
          <input
            className="input mono"
            value={draft.type}
            onChange={(event) => change({ type: event.target.value })}
            placeholder="Order[]"
          />
        </label>
      )}
      {fields.renderedBy && components.length > 0 && (
        <label className="form__field">
          Rendered by
          <select className="input" value={draft.renderedBy} onChange={(event) => change({ renderedBy: event.target.value })}>
            <option value="">Nothing yet</option>
            {components.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
      )}
      <p className="form__error" role="alert">
        {error}
      </p>
      <div className="form__actions">
        <button type="submit" className="btn btn--primary">
          Add
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** N: add a component, state, context, store, query or effect, written into the YAML. */
export function AddNodeDialog() {
  const open = useFlow((s) => s.dialog === 'add-node')
  const close = useFlow((s) => s.closeDialog)
  const graph = useFlow((s) => s.valid?.graph)

  return (
    <Modal open={open} onClose={close} label="Add a node" className="dialog--form">
      {graph && <AddNodeForm graph={graph} onClose={close} />}
    </Modal>
  )
}
