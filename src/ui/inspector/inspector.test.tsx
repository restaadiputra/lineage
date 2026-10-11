// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { flowYaml, renderApp } from '../../testing/render-app'
import { Inspector } from './inspector'

/** The inspector section under a heading such as "Reads it". */
const section = (title: string) => within(screen.getByText(title).closest('section') as HTMLElement)

function renderInspector(selectId?: string, options?: Parameters<typeof renderApp>[1]) {
  const app = renderApp(<Inspector />, options)
  if (selectId) act(() => app.store.getState().select({ id: selectId }))
  return app
}

describe('Inspector, Details tab', () => {
  it('says what to select and shows the shape key when nothing is selected', () => {
    renderInspector()
    expect(screen.getByText(/Select a state, context, store or query/)).toBeInTheDocument()
    expect(section('Shapes').getAllByRole('listitem')).toHaveLength(6)
  })

  it('lists who reads, writes, carries and re-renders for a data node', () => {
    renderInspector('orders')
    expect(screen.getByRole('heading', { level: 2, name: 'orders' })).toBeInTheDocument()
    expect(screen.getByText('useState')).toBeInTheDocument()

    expect(section('Reads it').getAllByRole('listitem')).toHaveLength(3)
    expect(section('Reads it').getByText('prop orders = orders')).toBeInTheDocument()
    expect(section('Writes it').getByText('mutates it in place (item.qty += 1)')).toBeInTheDocument()
    expect(section('Only passes it on').getByRole('button', { name: 'Sidebar' })).toBeInTheDocument()
    expect(section('Changes as a result').getByRole('button', { name: 'total' })).toBeInTheDocument()
    expect(section('Re-renders').getAllByRole('listitem')).toHaveLength(8)
    // An empty group shows its zero and no list.
    expect(section('Skipped by memo').getByText('0')).toBeInTheDocument()
    expect(section('Skipped by memo').queryByRole('list')).not.toBeInTheDocument()
  })

  it('narrows the impact when a field is picked', async () => {
    const { user, store } = renderInspector('orders')
    const whole = section('Fields').getByRole('button', { name: /all of it/ })
    expect(whole).toHaveAttribute('aria-pressed', 'true')

    await user.click(section('Fields').getByRole('button', { name: /^status/ }))

    expect(store.getState().selection).toEqual({ id: 'orders', fieldPath: '[].status' })
    expect(section('When this changes').getByText('orders[].status')).toBeInTheDocument()
    expect(section('Reads it').getAllByRole('listitem')).toHaveLength(2)
    expect(section('Writes it').getAllByRole('listitem')).toHaveLength(1)
    expect(whole).toHaveAttribute('aria-pressed', 'false')
  })

  it('follows a node link: selects it and asks the canvas to reveal it', async () => {
    const { user, store } = renderInspector('orders')
    await user.click(section('Reads it').getByRole('button', { name: 'OrderList' }))

    expect(store.getState().selection).toEqual({ id: 'OrderList' })
    expect(store.getState().revealToken).toBe(1)
    expect(screen.getByRole('heading', { level: 2, name: 'OrderList' })).toBeInTheDocument()
    expect(screen.getByText('component, memo')).toBeInTheDocument()
  })

  it('copies the source location', async () => {
    const { user, store, copied } = renderInspector('orders')
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(copied).toEqual(['src/orders/OrdersPage.tsx:20'])
    expect(store.getState().notice).toBe('Source copied')
  })

  it('describes a component: props, received props, writes and parents', () => {
    renderInspector('QtyStepper')
    expect(section('Props').getByText('Item')).toBeInTheDocument()
    expect(section('Receives').getByText('orders[].items[]')).toBeInTheDocument()
    expect(section('Receives').getByRole('button', { name: 'OrderRow' })).toBeInTheDocument()
    expect(section('Reads').getByText('add')).toBeInTheDocument()
    expect(section('Writes').getByText('mutates in place: item.qty += 1')).toBeInTheDocument()
    expect(section('Parents').getByRole('button', { name: 'OrderRow' })).toBeInTheDocument()
    expect(section('Children').getByText('0')).toBeInTheDocument()
  })

  it('flags props that are only passed on or recreated every render', () => {
    renderInspector('Layout')
    expect(section('Receives').getByText(/only passed on$/)).toBeInTheDocument()
    expect(section('Receives').getByText('callback, only passed on, new every render')).toBeInTheDocument()
  })

  it('describes an effect by its owner, dependencies and what it sets', () => {
    renderInspector('computeTotal')
    expect(screen.getByRole('button', { name: 'OrdersPage' })).toBeInTheDocument()
    expect(section('Depends on').getByText('orders')).toBeInTheDocument()
    expect(section('Sets').getByText('total')).toBeInTheDocument()
  })
})

describe('Inspector, Problems tab', () => {
  async function openProblems(options?: Parameters<typeof renderApp>[1]) {
    const app = renderInspector(undefined, options)
    await app.user.click(screen.getByRole('tab', { name: /Problems/ }))
    return app
  }

  it('shows the count on the tab and groups problems by severity', async () => {
    await openProblems()
    expect(screen.getByRole('tab', { name: 'Problems 11' })).toHaveAttribute('aria-selected', 'true')
    expect(section('Errors').getAllByRole('listitem')).toHaveLength(1)
    expect(section('Warnings').getAllByRole('listitem')).toHaveLength(7)
    expect(section('Notes').getAllByRole('listitem')).toHaveLength(3)
  })

  it('switches tabs with the arrow keys and keeps a single tab stop', async () => {
    const { user } = renderInspector()
    const details = screen.getByRole('tab', { name: 'Details' })
    const problems = screen.getByRole('tab', { name: /Problems/ })
    expect(details).toHaveAttribute('tabindex', '0')
    expect(problems).toHaveAttribute('tabindex', '-1')

    details.focus()
    await user.keyboard('{ArrowRight}')
    expect(problems).toHaveFocus()
    expect(problems).toHaveAttribute('aria-selected', 'true')
    expect(problems).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tabpanel', { name: /Problems/ })).toBeInTheDocument()

    // It wraps, and Home / End jump to the ends.
    await user.keyboard('{ArrowRight}')
    expect(details).toHaveFocus()
    await user.keyboard('{End}')
    expect(problems).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(details).toHaveAttribute('aria-selected', 'true')
  })

  it('opens a problem, selects its node and explains the fix', async () => {
    const { user, store } = await openProblems()
    const head = screen.getByRole('button', { name: /Header subscribes to all of uiStore/ })
    expect(head).toHaveAttribute('aria-expanded', 'false')

    await user.click(head)

    expect(head).toHaveAttribute('aria-expanded', 'true')
    expect(store.getState().selection).toEqual({ id: 'Header' })
    expect(store.getState().revealToken).toBe(1)
    expect(screen.getByText(/Select only what Header needs/)).toBeInTheDocument()

    // Opening another closes the first: one explanation at a time.
    await user.click(screen.getByRole('button', { name: /total is stored but derived/ }))
    expect(head).toHaveAttribute('aria-expanded', 'false')
  })

  it('ignores a problem with a reason, written into the YAML', async () => {
    const { user, store } = await openProblems()
    await user.click(screen.getByRole('button', { name: /Header subscribes to all of uiStore/ }))
    await user.click(screen.getByRole('button', { name: 'Ignore…' }))

    const confirm = screen.getByRole('button', { name: 'Ignore' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/Why is this acceptable/), 'Header shows every setting')
    await user.click(confirm)

    expect(store.getState().yaml).toMatch(/- rule: whole-store\n {4}node: Header\n {4}reason: Header shows every setting\n$/)
    expect(screen.queryByRole('button', { name: /Header subscribes/ })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Problems 10' })).toBeInTheDocument()
    expect(screen.getByText('Ignored (2)')).toBeInTheDocument()
    expect(screen.getByText('Header shows every setting')).toBeInTheDocument()
  })

  it('can back out of ignoring', async () => {
    const { user, store } = await openProblems()
    const before = store.getState().yaml
    await user.click(screen.getByRole('button', { name: /Header subscribes to all of uiStore/ }))
    await user.click(screen.getByRole('button', { name: 'Ignore…' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(store.getState().yaml).toBe(before)
    expect(screen.getByRole('button', { name: 'Ignore…' })).toBeInTheDocument()
  })

  it('says so when the design has no problems', async () => {
    await openProblems({ yaml: flowYaml('Clean') })
    expect(screen.getByText(/No problems found/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Problems' })).toBeInTheDocument()
  })
})
