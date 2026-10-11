import { describe, expect, it } from 'vitest'
import { assetsFromManifest, isWithin, layoutFileFor, minimalReplacement, parseSource, webviewHtml } from './pure'

describe('assetsFromManifest', () => {
  it('finds the entry script and its stylesheets', () => {
    const manifest = {
      '_elk.bundled.js': { file: 'assets/elk.bundled-abc.js' },
      'webview.html': { file: 'assets/webview-123.js', css: ['assets/webview-456.css'], isEntry: true },
    }
    expect(assetsFromManifest(manifest)).toEqual({ script: 'assets/webview-123.js', styles: ['assets/webview-456.css'] })
  })

  it('says how to fix a missing build', () => {
    expect(() => assetsFromManifest(null)).toThrow('npm run build:vscode')
    expect(() => assetsFromManifest({ 'chunk.js': { file: 'a.js' } })).toThrow('no entry')
  })
})

describe('webviewHtml', () => {
  const html = webviewHtml({ script: 'vscode-resource://x/webview.js', styles: ['vscode-resource://x/a.css'], cspSource: 'vscode-resource://x' })

  it('loads only the given script and styles', () => {
    expect(html).toContain('<script type="module" src="vscode-resource://x/webview.js"></script>')
    expect(html).toContain('<link rel="stylesheet" href="vscode-resource://x/a.css" />')
    expect(html).toContain('<div id="root"></div>')
  })

  it('locks the page down: nothing from the network, no inline script', () => {
    const policy = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? ''
    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain('script-src vscode-resource://x;')
    expect(policy).not.toMatch(/script-src[^;]*unsafe/)
    expect(policy).not.toMatch(/https?:/)
    expect(policy).not.toContain('connect-src')
  })
})

describe('parseSource', () => {
  it('splits a path from its line', () => {
    expect(parseSource('src/orders/OrderList.tsx:6')).toEqual({ path: 'src/orders/OrderList.tsx', line: 6 })
    expect(parseSource(' src/App.tsx:12:5 ')).toEqual({ path: 'src/App.tsx', line: 12 })
  })

  it('accepts a path with no line, and does not read a drive letter as one', () => {
    expect(parseSource('src/App.tsx')).toEqual({ path: 'src/App.tsx' })
    expect(parseSource('C:\\code\\App.tsx')).toEqual({ path: 'C:\\code\\App.tsx' })
    expect(parseSource('C:\\code\\App.tsx:9')).toEqual({ path: 'C:\\code\\App.tsx', line: 9 })
  })
})

describe('isWithin', () => {
  it('accepts files in the folder and below it', () => {
    expect(isWithin('/work/app', '/work/app/src/App.tsx')).toBe(true)
    expect(isWithin('/work/app/', '/work/app/App.tsx')).toBe(true)
  })

  it('refuses files outside the folder, including a sibling whose name starts the same', () => {
    expect(isWithin('/work/app', '/work/.ssh/config')).toBe(false)
    expect(isWithin('/work/app', '/work/app-secrets/keys.ts')).toBe(false)
    expect(isWithin('/work/app', '/work/app')).toBe(false)
  })
})

describe('minimalReplacement', () => {
  const apply = (before: string, after: string) => {
    const change = minimalReplacement(before, after)
    return change ? before.slice(0, change.start) + change.text + before.slice(change.end) : before
  }

  it('is nothing when the text is the same', () => {
    expect(minimalReplacement('abc', 'abc')).toBeNull()
  })

  it('replaces only the part that changed', () => {
    expect(minimalReplacement('name: Old\nnodes: []\n', 'name: New\nnodes: []\n')).toEqual({ start: 6, end: 9, text: 'New' })
    expect(minimalReplacement('a\nb\n', 'a\nx\nb\n')).toEqual({ start: 2, end: 2, text: 'x\n' })
    expect(minimalReplacement('a\nx\nb\n', 'a\nb\n')).toEqual({ start: 2, end: 4, text: '' })
  })

  it.each([
    ['', 'abc'],
    ['abc', ''],
    ['aaa', 'aa'],
    ['aa', 'aaa'],
    ['abcabc', 'abc'],
    ['renders: [A]', 'renders: [A, B]'],
    ['x', 'y'],
  ])('always produces the new text (%j → %j)', (before, after) => {
    expect(apply(before, after)).toBe(after)
  })
})

describe('layoutFileFor', () => {
  it('names the layout file next to the flow file', () => {
    expect(layoutFileFor('orders.flow.yaml')).toBe('orders.flow.layout.json')
    expect(layoutFileFor('orders.flow.yml')).toBe('orders.flow.layout.json')
  })
})
