import { Document, isCollection, isMap, isScalar, isSeq, LineCounter, parseDocument, stringify, type Pair, type YAMLMap, type YAMLSeq } from 'yaml'

/**
 * Adding to lists in a flow file by editing its text.
 *
 * The YAML document is parsed to find where things are and to format the new
 * item, but the item is spliced into the original text. Re-serialising the
 * document would keep comments yet re-pad every inline list and re-wrap long
 * lines, turning a one-line change into a diff of the whole file.
 *
 * A new item copies the style around it: inline `{ … }` where the list uses
 * that, block style and blank-line spacing where it uses those.
 */

type Range = [number, number, number]

interface Parsed {
  text: string
  doc: Document
  lines: LineCounter
}

const parse = (text: string): Parsed => {
  const lines = new LineCounter()
  return { text, doc: parseDocument(text, { lineCounter: lines }), lines }
}

const rangeOf = (node: unknown): Range | null =>
  node !== null && typeof node === 'object' && 'range' in node && Array.isArray(node.range) ? (node.range as Range) : null

const splice = (text: string, at: number, remove: number, insert: string) => text.slice(0, at) + insert + text.slice(at + remove)

const endWithNewline = (text: string) => (text === '' || text.endsWith('\n') ? text : text + '\n')

const indentLines = (text: string, indent: string) =>
  text
    .split('\n')
    .map((line) => (line ? indent + line : line))
    .join('\n')

/**
 * A value written on one line, safe inside an inline list or map:
 * `{ id: A, kind: component }`, `Header`, or `"orders[].items"` (quoted,
 * because brackets end an inline list).
 */
function inlineText(value: unknown): string {
  const doc = new Document([value])
  if (isCollection(doc.contents)) doc.contents.flow = true
  // Written as a one-item inline list, then unwrapped: "[ x ]" → "x".
  return doc.toString({ lineWidth: 0 }).trim().slice(1, -1).trim()
}

/** "- id: A\n  kind: component\n", or "- { id: A, kind: component }\n" when inline. */
const itemText = (value: unknown, inline: boolean) => (inline ? `- ${inlineText(value)}\n` : stringify([value], { lineWidth: 0 }))

/** Zero-based column of the character at `offset`. */
const columnOf = ({ lines }: Parsed, offset: number) => lines.linePos(offset).col - 1

/** Offset just past the line that `offset` is on (so past a trailing comment too). */
function afterLine(text: string, offset: number): number {
  const newline = text.indexOf('\n', Math.max(0, offset - 1))
  return newline < 0 ? text.length : newline + 1
}

/** Position just before a closing bracket, ahead of any padding space: `[a, b ]` → after `b`. */
function beforeClosing(text: string, closing: number): number {
  let at = closing
  while (at > 0 && text[at - 1] === ' ') at--
  return at
}

/**
 * Whether a list puts a blank line between every pair of items (the usual way
 * to write nodes). A list with only some blank lines uses them to group items,
 * as the sample's edges do, and a new item should not start a group.
 */
function separatedByBlankLines(text: string, seq: YAMLSeq): boolean {
  const ranges = seq.items.map(rangeOf)
  if (ranges.length < 2) return false
  return ranges.slice(1).every((range, index) => {
    const previous = ranges[index]
    // A block item's range ends after its line break, so step back one character to see it.
    return !!previous && !!range && /\n[ \t]*\r?\n/.test(text.slice(previous[1] - 1, range[0]))
  })
}

/** Add to a block list (`- a` lines), in the style and spacing its items already use. */
function appendToBlockSeq(parsed: Parsed, seq: YAMLSeq, value: unknown): string | null {
  const { text } = parsed
  const last = seq.items.at(-1)
  const lastRange = rangeOf(last)
  if (!lastRange) return null

  // "- " sits two columns before the item's content.
  const indent = ' '.repeat(Math.max(0, columnOf(parsed, lastRange[0]) - 2))
  const inline = isCollection(last) && !!last.flow

  const spaced = separatedByBlankLines(text, seq)

  const at = afterLine(text, lastRange[1])
  const head = endWithNewline(text.slice(0, at))
  return head + (spaced ? '\n' : '') + indentLines(itemText(value, inline), indent) + text.slice(at)
}

/** Add to an inline list: `[a, b]` → `[a, b, c]`. */
function appendToFlowSeq({ text }: Parsed, seq: YAMLSeq, value: unknown): string | null {
  const range = rangeOf(seq)
  if (!range || text[range[1] - 1] !== ']') return null
  const at = beforeClosing(text, range[1] - 1)
  return splice(text, at, 0, `${seq.items.length ? ', ' : ''}${inlineText(value)}`)
}

/** Turn `key: []` into a block list with one item, indented under the key. */
function replaceEmptySeq(parsed: Parsed, seq: YAMLSeq, key: unknown, value: unknown): string | null {
  const range = rangeOf(seq)
  const keyRange = rangeOf(key)
  if (!range || !keyRange) return null
  const indent = ' '.repeat(columnOf(parsed, keyRange[0]) + 2)
  // Drop the space after the colon as well, so the line does not end in whitespace.
  const start = beforeClosing(parsed.text, range[0])
  return splice(parsed.text, start, range[1] - start, '\n' + indentLines(itemText(value, false), indent).trimEnd())
}

const pairFor = (map: YAMLMap, key: string): Pair | undefined =>
  map.items.find((pair) => isScalar(pair.key) && pair.key.value === key)

/** Last resort for shapes the text edits do not cover: correct, but it reformats the file. */
function viaDocument(parsed: Parsed, path: (string | number)[], value: unknown): string {
  const { doc } = parsed
  const existing = doc.getIn(path, true)
  if (isSeq(existing)) existing.add(doc.createNode(value))
  else doc.setIn(path, doc.createNode([value]))
  return doc.toString({ lineWidth: 0 })
}

/** Append `value` to the top-level list `key` (nodes, edges, ignore). */
export function appendToTopLevelList(yamlText: string, key: string, value: unknown): string {
  const parsed = parse(yamlText)
  const root = parsed.doc.contents
  const pair = isMap(root) ? pairFor(root, key) : undefined

  if (!pair) {
    if (root !== null && !isMap(root)) return viaDocument(parsed, [key], value)
    const gap = yamlText.trim() === '' ? '' : '\n'
    return `${endWithNewline(yamlText)}${gap}${key}:\n${indentLines(itemText(value, false), '  ')}`
  }

  const list = pair.value
  let edited: string | null = null
  if (isSeq(list)) {
    if (!list.flow) edited = appendToBlockSeq(parsed, list, value)
    else if (list.items.length === 0) edited = replaceEmptySeq(parsed, list, pair.key, value)
  }
  return edited ?? viaDocument(parsed, [key], value)
}

/** Index and map of the node with this id inside `nodes:`. */
function findNode({ doc }: Parsed, nodeId: string): { index: number; map: YAMLMap } | null {
  const nodes = doc.get('nodes', true)
  if (!isSeq(nodes)) return null
  const index = nodes.items.findIndex((item) => isMap(item) && item.get('id') === nodeId)
  return index < 0 ? null : { index, map: nodes.items[index] as YAMLMap }
}

/** Give a node a key it does not have yet, as an inline list with one item: `renders: [Child]`. */
function addListKey(parsed: Parsed, map: YAMLMap, key: string, value: unknown): string | null {
  const { text } = parsed
  const range = rangeOf(map)
  const entry = `${key}: [${inlineText(value)}]`
  if (!range) return null

  if (map.flow) {
    if (text[range[1] - 1] !== '}') return null
    return splice(text, beforeClosing(text, range[1] - 1), 0, `${map.items.length ? ', ' : ''}${entry}`)
  }
  // Block map: a new line under the last key, lined up with the others.
  const firstKey = rangeOf(map.items[0]?.key)
  if (!firstKey) return null
  const indent = ' '.repeat(columnOf(parsed, firstKey[0]))
  const at = afterLine(text, range[1])
  return endWithNewline(text.slice(0, at)) + `${indent}${entry}\n` + text.slice(at)
}

/**
 * Append `value` to a list inside one node, e.g. a child to a component's
 * `renders`, or a path to an effect's `deps`. Throws if the node is not there.
 */
export function appendToNodeList(yamlText: string, nodeId: string, key: string, value: unknown): string {
  const parsed = parse(yamlText)
  const found = findNode(parsed, nodeId)
  if (!found) throw new Error(`The YAML has no node with id "${nodeId}"`)

  const pair = pairFor(found.map, key)
  let edited: string | null = null
  if (!pair) edited = addListKey(parsed, found.map, key, value)
  else if (isSeq(pair.value)) edited = pair.value.flow ? appendToFlowSeq(parsed, pair.value, value) : appendToBlockSeq(parsed, pair.value, value)
  return edited ?? viaDocument(parsed, ['nodes', found.index, key], value)
}
