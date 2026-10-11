import { describe, expect, it } from 'vitest'
import css from './tokens.css?raw'

/** The `--name: value` pairs declared in the first rule that opens with `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`No rule for ${selector} in tokens.css`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const tokens: Record<string, string> = {}
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) tokens[name] = value.trim()
  return tokens
}

const light = block(':root {')
const darkChosen = block(":root[data-theme='dark'] {")
const darkSystem = block(":root:not([data-theme='light']) {")

/** Follows `var(--other)` references to a hex color. */
function resolve(theme: Record<string, string>, name: string): string {
  const value = theme[name]
  const reference = /^var\(--([\w-]+)\)$/.exec(value ?? '')
  if (reference) return resolve(theme, reference[1])
  if (!/^#[0-9a-f]{6}$/i.test(value ?? '')) throw new Error(`--${name} is not a hex color: ${value}`)
  return value
}

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const BACKGROUNDS = ['surface', 'canvas']
/** Used for small text somewhere in the UI. */
const TEXT = ['ink', 'muted', 'source', 'rerender', 'error', 'info', 'reader-text', 'writer-text', 'warning-text']
/** Used only for borders, lines, dots and tints. */
const GRAPHICS = ['line', 'reader', 'writer', 'warning']

describe.each([
  ['light', light],
  ['dark', darkChosen],
])('%s theme contrast', (_name, theme) => {
  it.each(TEXT.flatMap((token) => BACKGROUNDS.map((background) => [token, background])))(
    '%s is readable as text on %s (AA, 4.5:1)',
    (token, background) => {
      expect(contrast(resolve(theme, token), resolve(theme, background))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(GRAPHICS.flatMap((token) => BACKGROUNDS.map((background) => [token, background])))(
    '%s is visible as a line on %s (3:1)',
    (token, background) => {
      expect(contrast(resolve(theme, token), resolve(theme, background))).toBeGreaterThanOrEqual(3)
    },
  )
})

describe('dark theme', () => {
  it('is the same whether chosen explicitly or followed from the system', () => {
    // tokens.css has to list the dark values twice; this keeps the copies in step.
    expect(darkSystem).toEqual(darkChosen)
  })

  it('redefines every color the light theme defines', () => {
    const colors = Object.keys(light).filter((name) => /^#|^var\(/.test(light[name]) && !name.startsWith('font'))
    for (const name of colors) expect(darkChosen, `--${name}`).toHaveProperty(name)
  })
})
