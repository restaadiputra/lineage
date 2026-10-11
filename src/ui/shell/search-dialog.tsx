import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { searchNodes } from '../../app/search'
import { kindWord } from '../../canvas/node-size'
import { isDataNode, type FlowNode } from '../../model/schema'
import { useFlow } from '../app-context'

const describe = (node: FlowNode) => (isDataNode(node) ? kindWord(node) : node.kind)

function SearchBox({ onClose }: { onClose(): void }) {
  const nodes = useFlow((s) => s.valid?.flow.nodes)
  const reveal = useFlow((s) => s.reveal)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = searchNodes(nodes ?? [], query)

  const choose = (node: FlowNode | undefined) => {
    if (!node) return
    onClose()
    reveal({ id: node.id })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
    if (step && results.length) {
      event.preventDefault()
      setActive((active + step + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(results[active])
    }
  }

  return (
    <>
      <input
        className="search__input"
        role="combobox"
        aria-label="Find a node by id"
        aria-expanded="true"
        aria-controls="search-results"
        aria-activedescendant={results[active] ? `search-${results[active].id}` : undefined}
        placeholder="Find a node by id"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        autoFocus
      />
      <ul className="search__results" id="search-results" role="listbox">
        {results.map((node, index) => (
          <li
            key={node.id}
            id={`search-${node.id}`}
            role="option"
            aria-selected={index === active}
            className="search__result"
            onPointerMove={() => setActive(index)}
            onClick={() => choose(node)}
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

/** Ctrl/Cmd+K: find a node, Enter selects it and pans to it. */
export function SearchDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className="search"
      aria-label="Search nodes"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === dialog.current) onClose()
      }}
    >
      {/* Mounted only while open, so every search starts empty. */}
      {open && <SearchBox onClose={onClose} />}
    </dialog>
  )
}
