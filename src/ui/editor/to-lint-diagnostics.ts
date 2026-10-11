import type { Diagnostic as LintDiagnostic } from '@codemirror/lint'
import type { Text } from '@codemirror/state'
import type { Diagnostic } from '../../model/parse'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Where to underline. Diagnostics are computed from a slightly older text than
 * the editor holds (the parse is debounced), so every offset is clamped.
 * A range never runs past its first line: a schema error on a whole node would
 * otherwise underline the entire block.
 */
function rangeOf(diagnostic: Diagnostic, doc: Text): { from: number; to: number } {
  if (diagnostic.from !== undefined) {
    const from = clamp(diagnostic.from, 0, doc.length)
    const lineEnd = doc.lineAt(from).to
    const to = clamp(diagnostic.to ?? lineEnd, from, lineEnd)
    return { from, to: to > from ? to : lineEnd }
  }
  const line = doc.line(clamp(diagnostic.line ?? 1, 1, doc.lines))
  const indent = line.text.length - line.text.trimStart().length
  return { from: line.from + indent, to: line.to }
}

/** Parser diagnostics → CodeMirror lint diagnostics for the current document. */
export function toLintDiagnostics(diagnostics: Diagnostic[], doc: Text): LintDiagnostic[] {
  return diagnostics.map((d) => ({ ...rangeOf(d, doc), severity: d.severity, message: d.message }))
}
