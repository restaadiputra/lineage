import { useState, type FormEvent } from 'react'
import { relationsBetween, type Relation } from '../../app/connect'
import type { Graph } from '../../model/graph'
import { useFlow, useServices } from '../app-context'
import { Modal } from '../shell/modal'
import { NodePicker } from '../shell/node-picker'
import './editing.css'

interface RelationFormProps {
  relations: Relation[]
  onBack(): void
  onDone(): void
}

/** Step two: which of the possible relations, and the prop name if it needs one. */
function RelationForm({ relations, onBack, onDone }: RelationFormProps) {
  const { store } = useServices()
  const [key, setKey] = useState(relations[0].key)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const chosen = relations.find((r) => r.key === key) ?? relations[0]

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (chosen.input && !input.trim()) return setError(`${chosen.input.label} is needed.`)
    if (!store.getState().applyEdits(chosen.edits(input))) return setError(store.getState().notice)
    onDone()
    store.getState().notify(`Added: ${chosen.sentence}`)
  }

  return (
    <form className="form" onSubmit={submit}>
      <fieldset className="form__choices form__choices--stacked">
        <legend>How are they connected?</legend>
        {relations.map((relation, index) => (
          <label key={relation.key} className="form__choice">
            <input
              type="radio"
              name="relation"
              checked={relation.key === key}
              onChange={() => {
                setKey(relation.key)
                setError(null)
              }}
              autoFocus={index === 0}
            />
            {relation.sentence}
          </label>
        ))}
      </fieldset>
      {chosen.input && (
        <label className="form__field">
          {chosen.input.label}
          <input
            className="input mono"
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              setError(null)
            }}
            placeholder={chosen.input.placeholder}
          />
        </label>
      )}
      <p className="form__error" role="alert">
        {error}
      </p>
      <div className="form__actions">
        <button type="submit" className="btn btn--primary">
          Connect
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    </form>
  )
}

function ConnectSteps({ graph, from, onClose }: { graph: Graph; from: string; onClose(): void }) {
  const [target, setTarget] = useState<string | null>(null)
  // Only nodes that can be connected to this one are offered, so there are no dead ends.
  const candidates = graph.flow.nodes.filter((node) => relationsBetween(graph, from, node.id).length > 0)

  if (candidates.length === 0) return <p className="form form__empty">Nothing in this flow can be connected to {from}.</p>
  return (
    <>
      <h2 className="form__title form__title--padded">
        Connect <span className="mono">{from}</span>
        {target && (
          <>
            {' '}
            and <span className="mono">{target}</span>
          </>
        )}
      </h2>
      {target ? (
        <RelationForm relations={relationsBetween(graph, from, target)} onBack={() => setTarget(null)} onDone={onClose} />
      ) : (
        <NodePicker nodes={candidates} label="Connect to which node?" onChoose={(node) => setTarget(node.id)} />
      )}
    </>
  )
}

/** C: connect the selected node to another one, written into the YAML. */
export function ConnectDialog() {
  const open = useFlow((s) => s.dialog === 'connect')
  const close = useFlow((s) => s.closeDialog)
  const graph = useFlow((s) => s.valid?.graph)
  const from = useFlow((s) => s.selection?.id)

  return (
    <Modal open={open} onClose={close} label="Connect nodes">
      {graph && from && <ConnectSteps graph={graph} from={from} onClose={close} />}
    </Modal>
  )
}
