import { useState, type KeyboardEvent } from 'react'
import { searchNodes } from '../../app/search'
import { kindWord } from '../../canvas/node-size'
import { isDataNode, type FlowNode } from '../../model/schema'

const describe = (node: FlowNode) => (isDataNode(node) ? kindWord(node) : node.kind)

interface NodePickerProps {
  nodes: FlowNode[]
  /** accessible name and placeholder of the input */
  label: string
  onChoose(node: FlowNode): void
}

/** Type to filter nodes by id, arrow keys to move, Enter to choose. */
export function NodePicker({ nodes, label, onChoose }: NodePickerProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = searchNodes(nodes, query)

  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
    if (step && results.length) {
      event.preventDefault()
      setActive((active + step + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (results[active]) onChoose(results[active])
    }
  }

  return (
    <>
      <input
        className="search__input"
        role="combobox"
        aria-label={label}
        aria-expanded="true"
        aria-controls="node-picker-results"
        aria-activedescendant={results[active] ? `node-picker-${results[active].id}` : undefined}
        placeholder={label}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        autoFocus
      />
      <ul className="search__results" id="node-picker-results" role="listbox">
        {results.map((node, index) => (
          <li
            key={node.id}
            id={`node-picker-${node.id}`}
            role="option"
            aria-selected={index === active}
            className="search__result"
            onPointerMove={() => setActive(index)}
            onClick={() => onChoose(node)}
          >
            <span>{node.id}</span>
            <span className="search__kind">{describe(node)}</span>
          </li>
        ))}
        {results.length === 0 && <li className="search__empty">No node matches “{query}”.</li>}
      </ul>
    </>
  )
}
