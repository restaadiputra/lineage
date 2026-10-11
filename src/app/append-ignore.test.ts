import { describe, expect, it } from 'vitest'
import sample from '../samples/orders.flow.yaml?raw'
import { analyze } from './analyze'
import { appendIgnore } from './append-ignore'

const entry = { rule: 'prop-drilling', node: 'Layout', reason: 'Layout is going away: "soon"' }
const lines = (...parts: string[]) => parts.join('\n') + '\n'

describe('appendIgnore', () => {
  it('adds the entry and removes the problem', () => {
    const before = analyze(sample).valid!
    const after = analyze(appendIgnore(sample, entry)).valid!
    expect(after.flow.ignore).toHaveLength(before.flow.ignore.length + 1)
    expect(after.flow.ignore.at(-1)).toEqual(entry)
    expect(after.problems.active.some((p) => p.rule === 'prop-drilling')).toBe(false)
    expect(after.problems.ignored.length).toBeGreaterThan(before.problems.ignored.length)
  })

  it('leaves the rest of the file exactly as written, comments included', () => {
    const out = appendIgnore(sample, entry)
    expect(out.startsWith(sample)).toBe(true)
    expect(out.slice(sample.length)).toBe(
      lines('  - rule: prop-drilling', '    node: Layout', `    reason: 'Layout is going away: "soon"'`),
    )
  })

  it('creates the list when the file has none, or an inline empty one', () => {
    for (const text of [lines('version: 1', 'name: Tiny'), lines('version: 1', 'name: Tiny', 'ignore: []')]) {
      const out = appendIgnore(text, { rule: 'list-key', reason: 'static list' })
      expect(analyze(out).valid?.flow.ignore).toEqual([{ rule: 'list-key', reason: 'static list' }])
      expect(out).toContain('ignore:\n  - rule: list-key')
    }
  })

  it('inserts before whatever follows the list', () => {
    const text = lines('version: 1', 'ignore:', '  - rule: list-key', '    reason: a # why', 'name: After')
    expect(appendIgnore(text, { rule: 'mutation', reason: 'b' })).toBe(
      lines(
        'version: 1',
        'ignore:',
        '  - rule: list-key',
        '    reason: a # why',
        '  - rule: mutation',
        '    reason: b',
        'name: After',
      ),
    )
  })
})
