import { describe, expect, it } from 'vitest'
import sample from '../samples/orders.flow.yaml?raw'
import { analyze } from './analyze'
import { appendToNodeList, appendToTopLevelList } from './yaml-list'

const lines = (...parts: string[]) => parts.join('\n') + '\n'

/** The non-blank lines of `after` that `before` does not have. */
function addedLines(before: string, after: string): string[] {
  const remaining = before.split('\n')
  return after.split('\n').filter((line) => {
    if (line.trim() === '') return false
    const index = remaining.indexOf(line)
    if (index < 0) return true
    remaining.splice(index, 1)
    return false
  })
}

const TOAST = { id: 'Toast', kind: 'component' }

describe('appendToTopLevelList', () => {
  it('adds a node to the sample in block style, with the blank line the others have', () => {
    const out = appendToTopLevelList(sample, 'nodes', TOAST)
    expect(addedLines(sample, out)).toEqual(['  - id: Toast', '    kind: component'])
    expect(out).toContain(lines('  - id: CheckoutButton', '    kind: component', '', '  - id: Toast', '    kind: component', '', 'edges:'))
    expect(analyze(out).valid?.graph.byId.has('Toast')).toBe(true)
  })

  it('adds an edge to the sample inline, like the edges around it', () => {
    const edge = { kind: 'reads', from: 'uiStore', to: 'CartBadge', fields: ['theme'] }
    const out = appendToTopLevelList(sample, 'edges', edge)
    expect(addedLines(sample, out)).toEqual(['  - { kind: reads, from: uiStore, to: CartBadge, fields: [ theme ] }'])
    expect(out).toContain(lines('name: total, data: total }', '  - { kind: reads, from: uiStore, to: CartBadge, fields: [ theme ] }', '', 'ignore:'))
    expect(analyze(out).valid?.flow.edges.at(-1)).toMatchObject(edge)
  })

  it('keeps every comment and every other character', () => {
    const out = appendToTopLevelList(sample, 'edges', { kind: 'reads', from: 'uiStore', to: 'CartBadge' })
    const removed = addedLines(out, sample)
    expect(removed).toEqual([])
    expect(out).toContain('# orders travel down through Layout and Sidebar')
  })

  it('writes inline nodes when the file writes its nodes inline', () => {
    const text = lines('version: 1', 'nodes:', '  - { id: App, kind: component }', '  - { id: Page, kind: component }', 'edges: []')
    expect(appendToTopLevelList(text, 'nodes', TOAST)).toBe(
      lines('version: 1', 'nodes:', '  - { id: App, kind: component }', '  - { id: Page, kind: component }', '  - { id: Toast, kind: component }', 'edges: []'),
    )
  })

  it('turns an empty inline list into a block list', () => {
    const text = lines('version: 1', 'name: New', '', 'types: {}', 'nodes: []', 'edges: []')
    expect(appendToTopLevelList(text, 'nodes', TOAST)).toBe(
      lines('version: 1', 'name: New', '', 'types: {}', 'nodes:', '  - id: Toast', '    kind: component', 'edges: []'),
    )
  })

  it('creates the list when the key is missing', () => {
    expect(appendToTopLevelList(lines('version: 1', 'name: Tiny'), 'nodes', TOAST)).toBe(
      lines('version: 1', 'name: Tiny', '', 'nodes:', '  - id: Toast', '    kind: component'),
    )
  })

  it('copes with a file that does not end in a newline', () => {
    const text = 'version: 1\nnodes:\n  - id: App\n    kind: component'
    const out = appendToTopLevelList(text, 'nodes', TOAST)
    expect(out).toBe(lines('version: 1', 'nodes:', '  - id: App', '    kind: component', '  - id: Toast', '    kind: component'))
  })

  it('falls back to rewriting the document for a populated inline list, and stays correct', () => {
    const text = lines('version: 1', 'nodes: [{ id: App, kind: component }]')
    const out = appendToTopLevelList(text, 'nodes', TOAST)
    expect(analyze(out).valid?.flow.nodes.map((n) => n.id)).toEqual(['App', 'Toast'])
  })

  it('quotes values that need it', () => {
    const out = appendToTopLevelList(sample, 'nodes', { id: 'draft', kind: 'state', owner: 'App', type: "Order[] | 'none'" })
    expect(analyze(out).valid?.graph.byId.get('draft')).toMatchObject({ type: "Order[] | 'none'" })
  })
})

describe('appendToNodeList', () => {
  it('adds to an inline list', () => {
    const out = appendToNodeList(sample, 'App', 'renders', 'Toast')
    expect(addedLines(sample, out)).toEqual(['    renders: [Header, OrdersPage, Toast]'])
  })

  it('keeps the padding of a padded inline list', () => {
    const text = lines('version: 1', 'nodes:', '  - id: App', '    kind: component', '    renders: [ Header ]', '  - { id: Header, kind: component }')
    expect(appendToNodeList(text, 'App', 'renders', 'Toast')).toContain('    renders: [ Header, Toast ]')
  })

  it('adds to a block list', () => {
    const out = appendToNodeList(sample, 'OrderList', 'renders', 'Empty')
    expect(addedLines(sample, out)).toEqual(['      - Empty'])
    expect(out).toContain(lines('      - { id: OrderRow, list: { key: index } }', '      - Empty', '    source: src/orders/OrderList.tsx:6'))
  })

  it('adds the key to a block node that does not have it', () => {
    const out = appendToNodeList(sample, 'CartBadge', 'renders', 'Count')
    expect(addedLines(sample, out)).toEqual(['    renders: [Count]'])
    expect(out).toContain(lines('  - id: CartBadge', '    kind: component', '    renders: [Count]', '', '  - id: OrdersPage'))
  })

  it('adds the key to an inline node that does not have it', () => {
    const text = lines('version: 1', 'nodes:', '  - { id: App, kind: component }', '  - { id: Page, kind: component }')
    expect(appendToNodeList(text, 'App', 'renders', 'Page')).toBe(
      lines('version: 1', 'nodes:', '  - { id: App, kind: component, renders: [Page] }', '  - { id: Page, kind: component }'),
    )
  })

  it('fills an empty inline list', () => {
    const out = appendToNodeList(sample.replace('sets: [orders]', 'sets: []'), 'syncOrders', 'sets', 'total')
    expect(out).toContain('    sets: [total]')
  })

  it('adds a data path to an effect', () => {
    const out = appendToNodeList(sample, 'computeTotal', 'deps', 'orders[].items')
    expect(addedLines(sample, out)).toEqual(['    deps: [orders, "orders[].items"]'])
    expect(analyze(out).valid?.graph.byId.get('computeTotal')).toMatchObject({ deps: ['orders', 'orders[].items'] })
  })

  it('refuses a node the file does not have', () => {
    expect(() => appendToNodeList(sample, 'Nobody', 'renders', 'Toast')).toThrow('no node with id "Nobody"')
  })
})
