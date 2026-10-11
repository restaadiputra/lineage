import { describe, expect, it } from 'vitest'
import { analyze } from '../app/analyze'
import sample from '../samples/orders.flow.yaml?raw'
import { problemBadges } from './badges'
import { anchorToward, arrowPath, connect, shiftAlongSide } from './edge-geometry'
import { computeFocus } from './focus'
import { layoutGraph } from './layout'
import { MAX_PROPS, sizeOf, visibleProps } from './node-size'
import { buildViewEdges } from './view-edges'
import { boundsOf, READABLE_ZOOM, readableViewport } from './viewport'

function load(text = sample) {
  const { valid } = analyze(text)
  if (!valid) throw new Error('sample did not parse')
  return { ...valid, viewEdges: buildViewEdges(valid.graph) }
}

const ids = (map: Map<string, unknown>) => [...map.keys()].sort()

describe('buildViewEdges', () => {
  const { viewEdges } = load()
  const byId = new Map(viewEdges.map((e) => [e.id, e]))
  const ofKind = (kind: string) => viewEdges.filter((e) => e.kind === kind)

  it('draws one tree edge per parent and child, carrying all props between them', () => {
    expect(ofKind('tree')).toHaveLength(11)
    const edge = byId.get('tree:OrdersPage>Layout')
    expect(edge?.props).toEqual(['orders', 'onSelect'])
    expect(edge?.keys).toEqual(['prop:OrdersPage>Layout:orders', 'prop:OrdersPage>Layout:onSelect'])
  })

  it('links owners and providers to what they own', () => {
    expect(ofKind('ownership').map((e) => e.id)).toEqual(
      expect.arrayContaining(['ownership:App>searchTerm', 'ownership:App>CartContext', 'ownership:OrdersPage>syncOrders']),
    )
    expect(ofKind('ownership')).toHaveLength(7)
  })

  it('turns effect deps and sets into read and write edges', () => {
    expect(byId.get('reads:ordersQuery>syncOrders')).toMatchObject({ source: 'ordersQuery', target: 'syncOrders' })
    expect(byId.get('writes:computeTotal>total')).toMatchObject({ source: 'computeTotal', target: 'total' })
  })

  it('keeps writes and mutations out of the layout', () => {
    const outside = viewEdges.filter((e) => !e.inLayout).map((e) => e.kind)
    expect(new Set(outside)).toEqual(new Set(['writes', 'mutates']))
  })

  it('files every edge under a filter group', () => {
    expect(byId.get('mutates:QtyStepper>orders')?.group).toBe('writes')
    expect(byId.get('derives:orders>total')?.group).toBe('writes')
    expect(byId.get('reads:uiStore>Header')?.group).toBe('reads')
  })
})

describe('computeFocus', () => {
  const { graph, viewEdges } = load()
  const rolesOf = (focus: ReturnType<typeof computeFocus>, id: string) => focus?.nodes.get(id)?.roles

  it('returns null without a selection', () => {
    expect(computeFocus(graph, viewEdges, null)).toBeNull()
    expect(computeFocus(graph, viewEdges, { id: 'nope' })).toBeNull()
  })

  it('lights up the routes of a data node', () => {
    const focus = computeFocus(graph, viewEdges, { id: 'orders' })
    expect(rolesOf(focus, 'orders')).toEqual(['source'])
    expect(rolesOf(focus, 'Layout')).toEqual(['carrier'])
    expect(rolesOf(focus, 'OrderList')).toEqual(['reader'])
    expect(rolesOf(focus, 'QtyStepper')).toEqual(['writer', 'reader'])
    expect(rolesOf(focus, 'syncOrders')).toEqual(['writer'])
    expect(rolesOf(focus, 'total')).toEqual(['cascade'])
    expect(rolesOf(focus, 'computeTotal')).toEqual(['cascade'])
    expect(focus?.nodes.get('OrdersPage')?.rerender).toBe(true)
    expect(focus?.nodes.has('SearchBox')).toBe(false)

    expect(focus?.edges.get('tree:OrdersPage>Layout')).toEqual({ role: 'carrier', label: 'orders' })
    expect(focus?.edges.get('mutates:QtyStepper>orders')?.role).toBe('writer')
    expect(focus?.edges.get('writes:syncOrders>orders')?.role).toBe('writer')
    expect(focus?.edges.get('derives:orders>total')?.role).toBe('cascade')
    expect(focus?.edges.get('reads:orders>computeTotal')?.role).toBe('cascade')
    expect(focus?.edges.get('ownership:OrdersPage>orders')?.role).toBe('related')
    expect(focus?.edges.has('reads:uiStore>Header')).toBe(false)
  })

  it('marks tree edges between re-rendering components', () => {
    const focus = computeFocus(graph, viewEdges, { id: 'orders' })
    expect(focus?.edges.get('tree:OrdersPage>CheckoutButton')?.role).toBe('rerender')
    // Header does not re-render when orders change, so its edge stays grey.
    expect(focus?.edges.has('tree:App>Header')).toBe(false)
  })

  it('narrows to a field path', () => {
    const focus = computeFocus(graph, viewEdges, { id: 'orders', fieldPath: '[].status' })
    expect(rolesOf(focus, 'OrderRow')).toEqual(['reader'])
    // QtyStepper only touches orders[].items, a sibling of status.
    expect(rolesOf(focus, 'QtyStepper')).toEqual([])
    expect(focus?.edges.has('mutates:QtyStepper>orders')).toBe(false)
  })

  it('flags memo components the simulation skips', () => {
    const focus = computeFocus(graph, viewEdges, { id: 'selectedId' })
    expect(ids(focus!.impact!.skipped)).toEqual([])
    // OrderList is memo but receives an unstable onSelect, so it still re-renders.
    expect(focus?.nodes.get('OrderList')).toMatchObject({ rerender: true, skipped: false })
  })

  it('shows a component with its lineage, children and data', () => {
    const focus = computeFocus(graph, viewEdges, { id: 'OrdersPage' })
    expect(rolesOf(focus, 'OrdersPage')).toEqual(['source'])
    for (const id of ['App', 'Layout', 'orders', 'syncOrders', 'ordersQuery']) expect(rolesOf(focus, id)).toEqual(['related'])
    expect(focus?.edges.get('reads:ordersQuery>OrdersPage')?.role).toBe('reader')
    expect(focus?.edges.get('tree:App>OrdersPage')?.role).toBe('related')
    expect(focus?.edges.get('tree:OrdersPage>Layout')?.label).toBe('orders, onSelect')
    expect(focus?.edges.has('tree:App>Header')).toBe(false)
  })

  it('shows an effect with its owner, deps and sets', () => {
    const focus = computeFocus(graph, viewEdges, { id: 'computeTotal' })
    expect(ids(focus!.nodes)).toEqual(['OrdersPage', 'computeTotal', 'orders', 'total'])
    expect(focus?.edges.get('reads:orders>computeTotal')?.role).toBe('reader')
    expect(focus?.edges.get('writes:computeTotal>total')?.role).toBe('writer')
  })
})

describe('node sizes', () => {
  const { graph } = load()

  it('grows components with their props and caps the list', () => {
    const plain = sizeOf(graph.byId.get('CartBadge')!)
    const withProps = sizeOf(graph.byId.get('OrderList')!)
    expect(withProps.height).toBeGreaterThan(plain.height)

    const props = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${i}`, 'string']))
    const many = visibleProps({ id: 'Big', kind: 'component', props })
    expect(many.shown).toHaveLength(MAX_PROPS)
    expect(many.hidden).toBe(3)
  })

  it('keeps every node within sane bounds', () => {
    for (const node of graph.flow.nodes) {
      const { width, height } = sizeOf(node)
      expect(width).toBeGreaterThan(60)
      expect(width).toBeLessThanOrEqual(264)
      expect(height).toBeGreaterThanOrEqual(26)
    }
  })
})

describe('edge geometry', () => {
  const box = { x: 0, y: 0, width: 100, height: 40 }

  it('anchors on the side facing the other node', () => {
    expect(anchorToward(box, { x: 50, y: 200 })).toEqual({ x: 50, y: 40, side: 'bottom' })
    expect(anchorToward(box, { x: 50, y: -200 })).toEqual({ x: 50, y: 0, side: 'top' })
    expect(anchorToward(box, { x: 400, y: 20 })).toEqual({ x: 100, y: 20, side: 'right' })
    expect(anchorToward(box, { x: -400, y: 20 })).toEqual({ x: 0, y: 20, side: 'left' })
  })

  it('connects two boxes border to border', () => {
    const { from, to } = connect(box, { x: 0, y: 200, width: 100, height: 40 })
    expect(from).toEqual({ x: 50, y: 40, side: 'bottom' })
    expect(to).toEqual({ x: 50, y: 200, side: 'top' })
  })

  it('shifts along the side and draws an arrow at the anchor', () => {
    expect(shiftAlongSide({ x: 50, y: 0, side: 'top' }, 8)).toMatchObject({ x: 58, y: 0 })
    expect(shiftAlongSide({ x: 0, y: 20, side: 'left' }, 8)).toMatchObject({ x: 0, y: 28 })
    expect(arrowPath({ x: 50, y: 0, side: 'top' })).toMatch(/^M50,0 /)
  })
})

describe('problemBadges', () => {
  it('counts problems on their first node and keeps the worst severity', () => {
    const { problems } = load()
    const badges = problemBadges(problems.active)
    const total = [...badges.values()].reduce((sum, b) => sum + b.count, 0)
    expect(total).toBe(problems.active.length)
    expect(badges.get('QtyStepper')?.severity).toBe('error')
  })
})

describe('layoutGraph', () => {
  it('places parents above children and owners above what they own', async () => {
    const { flow, viewEdges } = load()
    const nodes = flow.nodes.map((n) => ({ id: n.id, ...sizeOf(n) }))
    const positions = await layoutGraph(
      nodes,
      viewEdges.filter((e) => e.inLayout),
    )
    expect(Object.keys(positions)).toHaveLength(flow.nodes.length)
    expect(positions.App.y).toBeLessThan(positions.Header.y)
    expect(positions.OrdersPage.y).toBeLessThan(positions.orders.y)
    expect(positions.OrderList.y).toBeLessThan(positions.OrderRow.y)
  })
})

describe('readableViewport', () => {
  const view = { width: 660, height: 690 }

  it('shows a small diagram whole and centered, never enlarged', () => {
    const viewport = readableViewport({ x: 100, y: 50, width: 300, height: 200 }, view)
    expect(viewport.zoom).toBe(1)
    expect(viewport.x).toBe(660 / 2 - 250)
    expect(viewport.y).toBe(690 / 2 - 150)
  })

  it('shrinks to fit while the text stays readable', () => {
    const viewport = readableViewport({ x: 0, y: 0, width: 765, height: 400 }, view)
    expect(viewport.zoom).toBeCloseTo(0.8)
  })

  it('stops shrinking at the readable zoom and keeps a wide diagram centered', () => {
    const viewport = readableViewport({ x: 0, y: 0, width: 1348, height: 600 }, view)
    expect(viewport.zoom).toBe(READABLE_ZOOM)
    expect(viewport.x).toBe(660 / 2 - 674 * READABLE_ZOOM)
    expect(viewport.y).toBe(690 / 2 - 300 * READABLE_ZOOM)
  })

  it('starts a tall diagram at its top', () => {
    const viewport = readableViewport({ x: 0, y: 40, width: 1348, height: 2000 }, view)
    // The top edge of the diagram sits one padding below the top of the view.
    expect(40 * viewport.zoom + viewport.y).toBe(24)
  })

  it('finds the bounds of a set of rectangles', () => {
    expect(boundsOf([])).toBeNull()
    expect(
      boundsOf([
        { x: 10, y: 20, width: 100, height: 40 },
        { x: -30, y: 50, width: 50, height: 200 },
      ]),
    ).toEqual({ x: -30, y: 20, width: 140, height: 230 })
  })
})
