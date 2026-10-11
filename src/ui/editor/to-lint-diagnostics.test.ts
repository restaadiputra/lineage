import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { toLintDiagnostics } from './to-lint-diagnostics'

const doc = Text.of(['version: 1', 'nodes:', '  - id: App', '    kind: nonsense'])

describe('toLintDiagnostics', () => {
  it('keeps an offset range inside its first line', () => {
    const from = doc.line(3).from + 2
    const [d] = toLintDiagnostics([{ severity: 'error', message: 'bad node', from, to: doc.length }], doc)
    expect(d).toMatchObject({ from, to: doc.line(3).to, severity: 'error', message: 'bad node' })
  })

  it('underlines the text of a line when only the line is known', () => {
    const [d] = toLintDiagnostics([{ severity: 'warning', message: 'm', line: 4 }], doc)
    expect(doc.sliceString(d.from, d.to)).toBe('kind: nonsense')
  })

  it('clamps positions from an older, longer document', () => {
    const [byOffset, byLine] = toLintDiagnostics(
      [
        { severity: 'error', message: 'm', from: 9999, to: 10010 },
        { severity: 'error', message: 'm', line: 99 },
      ],
      doc,
    )
    expect(byOffset.from).toBeLessThanOrEqual(doc.length)
    expect(byOffset.to).toBeLessThanOrEqual(doc.length)
    expect(doc.lineAt(byLine.from).number).toBe(4)
  })

  it('falls back to the first line without a position', () => {
    const [d] = toLintDiagnostics([{ severity: 'error', message: 'm' }], doc)
    expect(doc.sliceString(d.from, d.to)).toBe('version: 1')
  })
})
