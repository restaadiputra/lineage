/**
 * A small TypeScript-type reader — just enough to build a field tree for the
 * impact view. Unknown shapes are kept as opaque text, never an error.
 */
export type TypeRef =
  | { t: 'array'; of: TypeRef; text: string }
  | { t: 'object'; name?: string; fields: Record<string, string>; text: string }
  | { t: 'union'; members: string[]; text: string }
  | { t: 'fn'; text: string }
  | { t: 'opaque'; text: string }

export type TypeTable = Record<string, string | Record<string, string>>

/** Split on a separator at bracket depth 0 */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === quote) quote = null
      cur += c
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if ('([{<'.includes(c)) depth++
    else if (')]}>'.includes(c) && !(c === '>' && s[i - 1] === '=')) depth--
    if (depth === 0 && s.startsWith(sep, i)) {
      out.push(cur)
      cur = ''
      i += sep.length - 1
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter((x) => x !== '')
}

function stripParens(s: string): string {
  let t = s.trim()
  while (t.startsWith('(') && t.endsWith(')')) {
    // only strip if the parens wrap the whole expression
    let depth = 0
    let wraps = true
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') depth++
      if (t[i] === ')') depth--
      if (depth === 0 && i < t.length - 1) {
        wraps = false
        break
      }
    }
    if (!wraps) break
    t = t.slice(1, -1).trim()
  }
  return t
}

export function readType(text: string, table: TypeTable, seen = new Set<string>()): TypeRef {
  const s = stripParens(text)
  if (splitTop(s, '=>').length > 1) return { t: 'fn', text: s }

  const union = splitTop(s, '|')
  if (union.length > 1) {
    const nonNull = union.filter((m) => m !== 'null' && m !== 'undefined')
    if (nonNull.length === 1) return readType(nonNull[0], table, seen)
    return { t: 'union', members: union, text: s }
  }
  if (s.endsWith('[]')) return { t: 'array', of: readType(s.slice(0, -2), table, seen), text: s }
  const arr = /^(?:Readonly)?Array<(.+)>$/.exec(s)
  if (arr) return { t: 'array', of: readType(arr[1], table, seen), text: s }

  if (s.startsWith('{') && s.endsWith('}')) {
    const fields: Record<string, string> = {}
    for (const part of splitTop(s.slice(1, -1), ',').flatMap((p) => splitTop(p, ';'))) {
      const i = part.indexOf(':')
      if (i > 0) fields[part.slice(0, i).trim().replace(/\?$/, '')] = part.slice(i + 1).trim()
    }
    return { t: 'object', fields, text: s }
  }

  const def = table[s]
  if (def !== undefined && !seen.has(s)) {
    if (typeof def === 'string') return readType(def, table, new Set([...seen, s]))
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(def)) fields[k.replace(/\?$/, '')] = v
    return { t: 'object', name: s, fields, text: s }
  }
  return { t: 'opaque', text: s }
}

export interface FieldNode {
  /** path segments relative to the data node */
  path: string[]
  label: string
  typeText: string
  children: FieldNode[]
}

/** Expand a type into a tree of selectable fields. */
export function fieldTree(text: string, table: TypeTable, maxDepth = 5): FieldNode[] {
  const walk = (ref: TypeRef, base: string[], depth: number, seen: Set<string>): FieldNode[] => {
    if (depth > maxDepth) return []
    if (ref.t === 'array') {
      const inner = ref.of
      const node: FieldNode = {
        path: [...base, '[]'],
        label: '[]',
        typeText: inner.text,
        children: walk(inner, [...base, '[]'], depth + 1, seen),
      }
      return [node]
    }
    if (ref.t === 'object') {
      if (ref.name && seen.has(ref.name)) return []
      const nextSeen = ref.name ? new Set([...seen, ref.name]) : seen
      return Object.entries(ref.fields).map(([k, v]) => {
        const child = readType(v, table)
        return {
          path: [...base, k],
          label: k,
          typeText: v,
          children: walk(child, [...base, k], depth + 1, nextSeen),
        }
      })
    }
    return []
  }
  return walk(readType(text, table), [], 0, new Set())
}
