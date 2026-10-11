// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { analyze } from '../../app/analyze'
import { computeFocus } from '../../canvas/focus'
import { buildViewEdges } from '../../canvas/view-edges'
import sample from '../../samples/orders.flow.yaml?raw'
import { renderApp } from '../../testing/render-app'
import { buildCanvasEdges, buildCanvasNodes } from './canvas-model'
import { FlowCanvas } from './flow-canvas'

const valid = analyze(sample).valid!
const viewEdges = buildViewEdges(valid.graph)
const ALL = { tree: true, reads: true, writes: true, ownership: true }

describe('buildCanvasNodes', () => {
  const build = (selectedId?: string) =>
    buildCanvasNodes({
      valid,
      positions: { orders: { x: 40, y: 80 } },
      focus: computeFocus(valid.graph, viewEdges, selectedId ? { id: selectedId } : null),
      selectedId,
    })
  const byId = (nodes: ReturnType<typeof build>, id: string) => nodes.find((n) => n.id === id)!

  it('gives every node a type, a fixed size and its saved position', () => {
    const nodes = build()
    expect(nodes).toHaveLength(valid.flow.nodes.length)
    expect(byId(nodes, 'orders')).toMatchObject({ type: 'data', position: { x: 40, y: 80 }, height: 48 })
    expect(byId(nodes, 'App').type).toBe('component')
    expect(byId(nodes, 'syncOrders').type).toBe('effect')
    expect(byId(nodes, 'App').position).toEqual({ x: 0, y: 0 })
  })

  it('carries problem badges', () => {
    const nodes = build()
    expect(byId(nodes, 'QtyStepper').data.badge).toEqual({ count: 1, severity: 'error' })
    expect(byId(nodes, 'App').data.badge).toBeNull()
  })

  it('dims nothing until something is selected', () => {
    expect(build().every((n) => !n.data.dimmed && !n.selected)).toBe(true)
  })

  it('marks the selection and dims what is outside its focus', () => {
    const nodes = build('orders')
    expect(byId(nodes, 'orders')).toMatchObject({ selected: true, data: { dimmed: false, focus: { roles: ['source'] } } })
    expect(byId(nodes, 'OrderList').data.focus?.roles).toEqual(['reader'])
    expect(byId(nodes, 'SearchBox').data).toMatchObject({ dimmed: true, focus: null })
  })
})

describe('buildCanvasEdges', () => {
  it('draws every edge when all groups are on', () => {
    expect(buildCanvasEdges(viewEdges, null, ALL)).toHaveLength(viewEdges.length)
  })

  it('hides the groups that are switched off', () => {
    const kinds = (filters: typeof ALL) => new Set(buildCanvasEdges(viewEdges, null, filters).map((e) => e.data?.kind))
    expect(kinds({ ...ALL, tree: false }).has('tree')).toBe(false)
    expect(kinds({ ...ALL, ownership: false }).has('ownership')).toBe(false)
    // Mutations and derivations travel with the writes toggle.
    expect(kinds({ ...ALL, writes: false })).toEqual(new Set(['tree', 'ownership', 'reads']))
  })

  it('lifts lit routes above the dimmed ones', () => {
    const focus = computeFocus(valid.graph, viewEdges, { id: 'orders' })
    const edges = buildCanvasEdges(viewEdges, focus, ALL)
    const lit = edges.find((e) => e.id === 'tree:OrdersPage>Layout')!
    const grey = edges.find((e) => e.id === 'reads:uiStore>Header')!
    expect(lit).toMatchObject({ zIndex: 1, data: { dimmed: false, focus: { role: 'carrier', label: 'orders' } } })
    expect(grey).toMatchObject({ zIndex: 0, data: { dimmed: true, focus: null } })
  })
})

describe('FlowCanvas', () => {
  it('explains the empty canvas when there has never been a valid diagram', () => {
    renderApp(<FlowCanvas />, { yaml: 'nodes: [' })
    expect(screen.getByText(/Nothing to draw yet/)).toBeInTheDocument()
  })
})
