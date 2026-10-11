import { describe, expect, it } from 'vitest'
import { buildGraph } from '../model/graph'
import { parseFlow } from '../model/parse'
import sample from '../samples/orders.flow.yaml?raw'
import { CODE_YAML, PLAN_YAML } from '../testing/compare-fixtures'
import { compareFlows, mergeFlows } from './compare'
import { computeImpact } from './impact'

function flowOf(text: string) {
  const { flow, diagnostics } = parseFlow(text)
  if (!flow) throw new Error(JSON.stringify(diagnostics))
  return flow
}

const plan = flowOf(PLAN_YAML)
const code = flowOf(CODE_YAML)
const diff = compareFlows(plan, code)
const item = (key: string) => diff.byKey.get(key)!

describe('compareFlows', () => {
  it('finds nothing between a flow and itself', () => {
    const same = compareFlows(flowOf(sample), flowOf(sample))
    expect(same.counts).toMatchObject({ 'plan-only': 0, 'code-only': 0, changed: 0 })
    expect(same.counts.same).toBeGreaterThan(40)
  })

  it('ignores where the code lives: source and note are not differences', () => {
    expect(item('App').status).toBe('same')
  })

  it('sorts nodes into only-in-plan, only-in-code and changed', () => {
    expect(item('Planned').status).toBe('plan-only')
    expect(item('Total').status).toBe('code-only')
    expect(item('cart')).toMatchObject({ status: 'changed', changes: [{ field: 'owner', plan: 'CartPage', code: 'App' }] })
    expect(item('CartList').changes).toEqual([{ field: 'memo', plan: 'yes', code: null }])
    expect(item('Header').changes).toEqual([{ field: 'props.onSearch', plan: null, code: '() => void' }])
  })

  it('compares edges by what they connect, and their details', () => {
    expect(item('prop:App>Header:title').changes).toEqual([{ field: 'stable', plan: null, code: 'no' }])
    expect(item('prop:App>Header:onSearch')).toMatchObject({ status: 'code-only', label: 'prop onSearch: App → Header' })
    expect(item('reads:cart>CartList').changes).toEqual([{ field: 'fields', plan: 'items', code: null }])
    expect(item('writes:CartList>cart').status).toBe('plan-only')
    expect(item('mutates:CartList>cart').status).toBe('code-only')
  })

  it('treats render links and effect deps and sets as edges', () => {
    expect(item('tree:CartPage>Total')).toMatchObject({ status: 'code-only', label: 'renders CartPage → Total' })
    expect(item('tree:App>Header').status).toBe('same')
    expect(item('reads:cart>sync').status).toBe('same')
    expect(item('writes:sync>cart')).toMatchObject({ status: 'code-only', label: 'sets sync → cart' })
  })

  it('compares types field by field', () => {
    const types = Object.fromEntries(diff.types.map((t) => [t.key, t]))
    expect(types.Item.changes).toEqual([{ field: 'price', plan: null, code: 'number' }])
    expect(types.Cart.status).toBe('plan-only')
    expect(types.Money.status).toBe('code-only')
  })

  it('counts every item once', () => {
    const total = diff.nodes.length + diff.edges.length + diff.types.length
    expect(Object.values(diff.counts).reduce((a, b) => a + b, 0)).toBe(total)
    expect(diff.counts['code-only']).toBeGreaterThan(0)
  })

  it('keeps two edges between the same nodes apart', () => {
    const twice = flowOf(`
version: 1
nodes:
  - { id: A, kind: component }
  - { id: s, kind: state, owner: A, type: number }
edges:
  - { kind: writes, from: A, to: s, via: increment }
  - { kind: writes, from: A, to: s, via: reset }
`)
    const result = compareFlows(twice, twice)
    expect(result.edges.map((e) => e.key)).toEqual(['writes:A>s', 'writes:A>s#2'])
    expect(result.counts.changed).toBe(0)
  })
})

describe('mergeFlows', () => {
  const merged = mergeFlows(plan, code)
  const byId = new Map(merged.nodes.map((n) => [n.id, n]))

  it('contains every node from both, the plan version where both have it', () => {
    expect(merged.nodes.map((n) => n.id)).toEqual([...plan.nodes.map((n) => n.id), 'Total'])
    expect(byId.get('cart')).toMatchObject({ owner: 'CartPage' })
    expect(merged.name).toBe('Cart plan')
  })

  it('adds the render links, deps and sets that only the code has', () => {
    expect(byId.get('CartPage')).toMatchObject({ renders: ['CartList', 'Total'] })
    expect(byId.get('sync')).toMatchObject({ deps: ['cart'], sets: ['cart'] })
  })

  it('adds the edges only the code has, once', () => {
    const keys = merged.edges.map((e) => `${e.kind}:${e.from}>${e.to}`)
    expect(keys).toEqual(['prop:App>Header', 'reads:cart>CartList', 'writes:CartList>cart', 'prop:App>Header', 'mutates:CartList>cart'])
  })

  it('is a graph the engine can analyse', () => {
    const graph = buildGraph(merged)
    expect(graph.children.get('CartPage')?.map((l) => l.child)).toEqual(['CartList', 'Total'])
    expect(() => computeImpact(graph, ['cart'])).not.toThrow()
  })
})
