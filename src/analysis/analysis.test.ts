import sample from '../samples/orders.flow.yaml?raw'
import { describe, expect, it } from 'vitest'
import { parseFlow } from '../model/parse'
import { buildGraph } from '../model/graph'
import { parsePath } from '../model/paths'
import { fieldTree } from '../model/typeExpr'
import { computeImpact } from './impact'
import { applyIgnores, runRules } from './rules'


function load(text = sample) {
  const r = parseFlow(text)
  if (!r.flow) throw new Error(JSON.stringify(r.diagnostics, null, 2))
  return { ...r, g: buildGraph(r.flow) }
}

describe('parse', () => {
  it('parses the sample without errors', () => {
    const { diagnostics, nodeLines } = load()
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(nodeLines.App).toBeGreaterThan(0)
  })

  it('reports unknown references with a line number', () => {
    const r = parseFlow('version: 1\nnodes:\n  - { id: x, kind: state, owner: Nope, type: string }\n')
    expect(r.flow).toBeNull()
    expect(r.diagnostics[0].message).toContain('Owner "Nope"')
    expect(r.diagnostics[0].line).toBe(3)
  })

  it('reports YAML syntax errors', () => {
    const r = parseFlow('version: 1\nnodes: [\n')
    expect(r.flow).toBeNull()
    expect(r.diagnostics.length).toBeGreaterThan(0)
  })
})

describe('paths and types', () => {
  it('parses array paths', () => {
    expect(parsePath('orders[].items[].qty')).toEqual(['orders', '[]', 'items', '[]', 'qty'])
    expect(parsePath('[].status')).toEqual(['[]', 'status'])
  })

  it('builds a field tree', () => {
    const { g } = load()
    const tree = fieldTree('Order[]', g.flow.types)
    expect(tree[0].label).toBe('[]')
    expect(tree[0].children.map((c) => c.label)).toEqual(['id', 'customer', 'status', 'items'])
  })
})

describe('rules', () => {
  const { g } = load()
  const problems = runRules(g)
  const rules = new Set(problems.map((p) => p.rule))

  it.each([
    'mutation',
    'prop-drilling',
    'derived-state',
    'server-state-copy',
    'effect-chain',
    'unstable-memo-prop',
    'busy-context',
    'list-key',
    'state-too-high',
    'whole-store',
  ])('flags %s in the sample', (rule) => {
    expect(rules.has(rule)).toBe(true)
  })

  it('reports prop drilling through Layout and Sidebar', () => {
    const p = problems.find((x) => x.rule === 'prop-drilling' && x.title.startsWith('orders'))
    expect(p?.title).toBe('orders is drilled through Layout → Sidebar')
  })

  it('suggests moving searchTerm down to SearchBox', () => {
    const p = problems.find((x) => x.rule === 'state-too-high')
    expect(p?.title).toBe('searchTerm could live in SearchBox')
  })

  it('applies ignore entries', () => {
    const { active, ignored } = applyIgnores(problems, g.flow.ignore)
    expect(ignored.map((i) => i.problem.rule)).toEqual(['list-key'])
    expect(active.some((p) => p.rule === 'list-key')).toBe(false)
  })

  it('flags an effect that sets its own dependency', () => {
    const { g: g2 } = load(`version: 1
nodes:
  - { id: A, kind: component }
  - { id: n, kind: state, owner: A, type: number }
  - { id: bump, kind: effect, owner: A, deps: [n], sets: [n] }
`)
    expect(runRules(g2).map((p) => p.rule)).toContain('effect-loop')
  })
})

describe('impact', () => {
  const { g } = load()

  it('finds readers, carriers and writers of orders', () => {
    const i = computeImpact(g, ['orders'])
    expect([...i.carriers.keys()].sort()).toEqual(['Layout', 'Sidebar'])
    expect(i.readers.has('OrderList')).toBe(true)
    expect(i.writers.has('QtyStepper')).toBe(true)
    expect(i.writers.has('syncOrders')).toBe(true)
  })

  it('follows effects and derives to cascade changes', () => {
    const i = computeImpact(g, ['orders'])
    expect(i.cascade.has('total')).toBe(true)
    expect(i.rerenders.get('OrderSummary')).toBe('parent OrdersPage re-rendered')
  })

  it('records the edges that carry cascaded data, apart from the direct route', () => {
    const i = computeImpact(g, ['orders'])
    expect([...i.cascadeEdges]).toEqual(['prop:OrdersPage>OrderSummary:total'])
    expect(i.edges.has('prop:OrdersPage>OrderSummary:total')).toBe(false)

    // From the query, the whole orders route is a consequence of the copy into state.
    const fromQuery = computeImpact(g, ['ordersQuery'])
    expect(fromQuery.cascadeEdges.has('prop:Sidebar>OrderList:orders')).toBe(true)
    expect(fromQuery.cascadeEdges.has('prop:OrdersPage>OrderSummary:total')).toBe(true)
    // Its own reader is on the direct route, not the cascade.
    expect(fromQuery.edges.has('reads:ordersQuery>OrdersPage')).toBe(true)
    expect(fromQuery.cascadeEdges.has('reads:ordersQuery>OrdersPage')).toBe(false)
  })

  it('narrows to a field', () => {
    const i = computeImpact(g, parsePath('orders[].status'))
    // QtyStepper only receives orders[].items[], a sibling of status
    expect(i.readers.has('QtyStepper')).toBe(false)
    expect(i.readers.has('OrderRow')).toBe(true)
  })

  it('explains why memo did not help', () => {
    const i = computeImpact(g, ['orders'])
    expect(i.rerenders.get('OrderList')).toBe('memo, but prop orders changed')
  })

  it('re-renders only selecting consumers of a store', () => {
    const i = computeImpact(g, parsePath('CartContext.count'))
    expect(i.rerenders.get('CartBadge')).toBe('consumes CartContext')
    expect(i.rerenders.has('CheckoutButton')).toBe(false)
  })
})
