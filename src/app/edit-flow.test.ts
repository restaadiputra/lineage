import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../adapters/memory-storage'
import sample from '../samples/orders.flow.yaml?raw'
import { CODE_YAML } from '../testing/compare-fixtures'
import { analyze } from './analyze'
import { relationsBetween } from './connect'
import { applyEdits, draftProblem, editsForNewNode, type NodeDraft } from './edit-flow'
import { createFlowStore } from './flow-store'
import { NEW_FLOW_YAML } from './new-flow'

const graph = analyze(sample).valid!.graph
const draft = (over: Partial<NodeDraft>): NodeDraft => ({ kind: 'component', id: '', owner: '', type: '', renderedBy: '', ...over })

describe('draftProblem', () => {
  it('accepts a complete draft of each kind', () => {
    expect(draftProblem(draft({ id: 'Toast' }), graph)).toBeNull()
    expect(draftProblem(draft({ kind: 'state', id: 'open', owner: 'App', type: 'boolean' }), graph)).toBeNull()
    expect(draftProblem(draft({ kind: 'store', id: 'cartStore', type: 'Cart' }), graph)).toBeNull()
    expect(draftProblem(draft({ kind: 'effect', id: 'track', owner: 'App' }), graph)).toBeNull()
  })

  it('explains what is missing or wrong, one thing at a time', () => {
    expect(draftProblem(draft({ id: ' ' }), graph)).toBe('Give it an id.')
    expect(draftProblem(draft({ id: 'my node' }), graph)).toMatch(/^Ids are identifiers/)
    expect(draftProblem(draft({ id: 'App' }), graph)).toBe('There is already a node called App.')
    expect(draftProblem(draft({ kind: 'state', id: 'open', type: 'boolean' }), graph)).toBe('Choose the component that owns it.')
    expect(draftProblem(draft({ kind: 'context', id: 'Theme', owner: 'orders', type: 'Theme' }), graph)).toBe(
      'Choose the component that provides it.',
    )
    expect(draftProblem(draft({ kind: 'query', id: 'userQuery' }), graph)).toMatch(/^Give it a type/)
  })
})

describe('adding a node', () => {
  const add = (yaml: string, over: Partial<NodeDraft>) => analyze(applyEdits(yaml, editsForNewNode(draft(over)))).valid!

  it('adds a component and has its parent render it', () => {
    const { graph: next } = add(sample, { id: 'Toast', renderedBy: 'App' })
    expect(next.byId.get('Toast')).toMatchObject({ kind: 'component' })
    expect(next.children.get('App')?.map((l) => l.child)).toEqual(['Header', 'OrdersPage', 'Toast'])
  })

  it('adds state with its owner and type, trimmed', () => {
    const { graph: next } = add(sample, { kind: 'state', id: ' draft ', owner: 'OrdersPage', type: ' Order | null ' })
    expect(next.byId.get('draft')).toMatchObject({ kind: 'state', owner: 'OrdersPage', type: 'Order | null' })
  })

  it('uses provider for a context and only what each kind needs', () => {
    const { graph: next } = add(sample, { kind: 'context', id: 'ThemeContext', owner: 'App', type: 'Theme', renderedBy: 'App' })
    expect(next.byId.get('ThemeContext')).toMatchObject({ kind: 'context', provider: 'App', type: 'Theme' })
    expect(next.children.get('App')).toHaveLength(2)

    const { graph: withEffect } = add(sample, { kind: 'effect', id: 'track', owner: 'App', type: 'ignored' })
    expect(withEffect.byId.get('track')).toEqual({ id: 'track', kind: 'effect', owner: 'App', deps: [], sets: [] })
  })

  it('builds a flow from nothing', () => {
    let yaml = NEW_FLOW_YAML
    yaml = applyEdits(yaml, editsForNewNode(draft({ id: 'App' })))
    yaml = applyEdits(yaml, editsForNewNode(draft({ id: 'Page', renderedBy: 'App' })))
    yaml = applyEdits(yaml, editsForNewNode(draft({ kind: 'state', id: 'count', owner: 'Page', type: 'number' })))
    const { flow } = analyze(yaml).valid!
    expect(flow.nodes.map((n) => n.id)).toEqual(['App', 'Page', 'count'])
    expect(yaml).toContain('nodes:\n  - id: App\n    kind: component\n    renders: [Page]\n  - id: Page')
  })
})

describe('relationsBetween', () => {
  const sentences = (a: string, b: string) => relationsBetween(graph, a, b).map((r) => r.sentence)

  it('offers what two components can be to each other, but never a loop', () => {
    expect(sentences('Header', 'OrderSummary')).toEqual([
      'Header renders OrderSummary',
      'Header passes a prop to OrderSummary',
      'OrderSummary renders Header',
      'OrderSummary passes a prop to Header',
    ])
    // App already renders Header, and Header rendering App would be a cycle.
    expect(sentences('App', 'Header')).toEqual(['App passes a prop to Header'])
  })

  it('offers reads and writes between data and a component, minus what exists', () => {
    expect(sentences('orders', 'CartBadge')).toEqual(['CartBadge reads orders', 'CartBadge writes orders'])
    // Header already reads uiStore.
    expect(sentences('Header', 'uiStore')).toEqual(['Header writes uiStore'])
  })

  it('offers derivation between data, and deps and sets with an effect', () => {
    expect(sentences('searchTerm', 'total')).toEqual(['total is derived from searchTerm', 'searchTerm is derived from total'])
    expect(sentences('selectedId', 'computeTotal')).toEqual(['computeTotal depends on selectedId', 'computeTotal sets selectedId'])
    // computeTotal already depends on orders and sets total.
    expect(sentences('computeTotal', 'orders')).toEqual(['computeTotal sets orders'])
    expect(sentences('computeTotal', 'total')).toEqual(['computeTotal depends on total'])
  })

  it('offers nothing for kinds that do not connect, or a node and itself', () => {
    expect(sentences('App', 'computeTotal')).toEqual([])
    expect(sentences('App', 'App')).toEqual([])
    expect(sentences('App', 'Nobody')).toEqual([])
  })

  it('produces edits that parse and do what the sentence says', () => {
    const pick = (a: string, b: string, sentence: string) => relationsBetween(graph, a, b).find((r) => r.sentence === sentence)!
    const after = (edits: ReturnType<ReturnType<typeof pick>['edits']>) => analyze(applyEdits(sample, edits)).valid!

    expect(after(pick('orders', 'CartBadge', 'CartBadge reads orders').edits('')).flow.edges.at(-1)).toMatchObject({
      kind: 'reads',
      from: 'orders',
      to: 'CartBadge',
    })
    expect(after(pick('selectedId', 'computeTotal', 'computeTotal depends on selectedId').edits('')).graph.byId.get('computeTotal')).toMatchObject({
      deps: ['orders', 'selectedId'],
    })

    // A prop to a child that is not rendered yet adds the render link too.
    const withProp = after(pick('Header', 'OrderSummary', 'Header passes a prop to OrderSummary').edits(' label '))
    expect(withProp.flow.edges.at(-1)).toMatchObject({ kind: 'prop', from: 'Header', to: 'OrderSummary', name: 'label' })
    expect(withProp.graph.children.get('Header')?.map((l) => l.child)).toContain('OrderSummary')
  })
})

describe('editing through the store', () => {
  const setup = (yaml = sample) => createFlowStore({ storage: createMemoryStorage({ 'lineage:yaml': yaml }), sampleYaml: sample })

  it('applies edits, updates the diagram and reports success', () => {
    const store = setup()
    const done = store.getState().applyEdits(editsForNewNode(draft({ id: 'Toast', renderedBy: 'App' })))
    expect(done).toBe(true)
    expect(store.getState().valid?.graph.byId.has('Toast')).toBe(true)
    expect(store.getState().yaml).toContain('renders: [Header, OrdersPage, Toast]')
  })

  it('refuses an edit that would break the flow, and changes nothing', () => {
    const store = setup()
    const before = store.getState().yaml
    const done = store.getState().applyEdits([{ type: 'edge', edge: { kind: 'reads', from: 'Nobody', to: 'App' } }])
    expect(done).toBe(false)
    expect(store.getState().yaml).toBe(before)
    expect(store.getState().notice).toMatch(/^Could not make that change: /)
  })

  it('refuses to edit while the YAML has errors', () => {
    const store = setup()
    store.getState().loadYaml('nodes: [')
    expect(store.getState().applyEdits(editsForNewNode(draft({ id: 'Toast' })))).toBe(false)
    expect(store.getState().notice).toBe('Fix the errors in the YAML before editing on the canvas.')
  })

  it('refuses to edit while comparing', () => {
    const store = setup()
    store.getState().compareWith('code.flow.yaml', CODE_YAML)
    expect(store.getState().applyEdits(editsForNewNode(draft({ id: 'Toast' })))).toBe(false)
    expect(store.getState().notice).toBe('Stop comparing before editing on the canvas.')
  })

  it('opens the Connect dialog only when a node is selected', () => {
    const store = setup()
    store.getState().openDialog('connect')
    expect(store.getState().dialog).toBeNull()
    expect(store.getState().notice).toBe('Select a node first, then connect it.')

    store.getState().select({ id: 'orders' })
    store.getState().openDialog('connect')
    expect(store.getState().dialog).toBe('connect')
    store.getState().closeDialog()
    expect(store.getState().dialog).toBeNull()
  })
})
