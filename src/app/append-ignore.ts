import { isNode, isSeq, LineCounter, parseDocument, stringify } from 'yaml'
import type { IgnoreEntry } from '../model/schema'

const indentLines = (text: string, indent: string) =>
  text
    .split('\n')
    .map((line) => (line ? indent + line : line))
    .join('\n')

/** The entry as a block-list item, e.g. "- rule: list-key\n  reason: …\n". */
function entryText({ rule, node, reason }: IgnoreEntry): string {
  // Key order matches how FORMAT.md writes ignore entries.
  return stringify([node ? { rule, node, reason } : { rule, reason }], { lineWidth: 0 })
}

const endWithNewline = (text: string) => (text === '' || text.endsWith('\n') ? text : text + '\n')

/**
 * Adds an entry to the flow file's `ignore:` list and returns the new text.
 *
 * The YAML document is used to find the list and to format the entry, but the
 * entry is spliced into the original text: re-serialising the whole document
 * would keep comments yet re-pad every inline list the author wrote.
 */
export function appendIgnore(yamlText: string, entry: IgnoreEntry): string {
  const lineCounter = new LineCounter()
  const doc = parseDocument(yamlText, { lineCounter })
  const list = doc.get('ignore', true)

  if (list === undefined) {
    return `${endWithNewline(yamlText)}\nignore:\n${indentLines(entryText(entry), '  ')}`
  }

  const last = isSeq(list) && !list.flow ? list.items.at(-1) : undefined
  const range = isNode(last) ? last.range : null
  if (!range) {
    // `ignore: []` or another inline form: nothing to splice after, so rewrite through the document.
    doc.set('ignore', doc.createNode([entry.node ? entry : { rule: entry.rule, reason: entry.reason }]))
    return doc.toString({ lineWidth: 0 })
  }

  // Line up with the dash of the last item ("- " sits two columns before its content).
  const indent = ' '.repeat(Math.max(0, lineCounter.linePos(range[0]).col - 3))
  const head = endWithNewline(yamlText.slice(0, range[2]))
  return head + indentLines(entryText(entry), indent) + yamlText.slice(range[2])
}
