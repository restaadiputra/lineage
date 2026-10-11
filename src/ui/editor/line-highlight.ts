import { StateEffect, StateField, type Text } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

/** Set (1-based line) or clear (null) the line of the node selected on the canvas. */
export const setHighlightedLine = StateEffect.define<number | null>()

const lineMark = Decoration.line({ class: 'cm-lineage-node-line' })

function decorate(doc: Text, line: number | null): DecorationSet {
  if (line === null || line < 1 || line > doc.lines) return Decoration.none
  return Decoration.set([lineMark.range(doc.line(line).from)])
}

export const highlightedLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setHighlightedLine)) return decorate(transaction.state.doc, effect.value)
    // Typing above the node moves the highlight with its line.
    return decorations.map(transaction.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})
