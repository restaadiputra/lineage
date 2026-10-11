// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NEW_FLOW_YAML } from '../../app/new-flow'
import { renderApp } from '../../testing/render-app'
import { AppShell } from '../shell/app-shell'

/** The shell with stand-in panels; the dialogs under test live in the shell. */
const renderShell = (options?: Parameters<typeof renderApp>[1]) =>
  renderApp(<AppShell editor={<p>editor</p>} canvas={<p>canvas</p>} inspector={<p>inspector</p>} />, options)

const addDialog = () => within(screen.getByRole('dialog', { name: 'Add a node' }))
const connectDialog = () => within(screen.getByRole('dialog', { name: 'Connect nodes' }))

describe('Add node', () => {
  it('opens with N and adds a component on Enter', async () => {
    const { user, store } = renderShell()
    await user.keyboard('n')
    await user.type(addDialog().getByLabelText('Id'), 'Toast{Enter}')

    expect(store.getState().valid?.graph.byId.get('Toast')).toMatchObject({ kind: 'component' })
    expect(store.getState().selection).toEqual({ id: 'Toast' })
    expect(store.getState().revealToken).toBe(1)
    expect(screen.queryByRole('dialog', { name: 'Add a node' })).not.toBeInTheDocument()
  })

  it('does not type the shortcut letter into the id field', async () => {
    const { user } = renderShell()
    await user.keyboard('n')
    expect(addDialog().getByLabelText('Id')).toHaveValue('')
  })

  it('offers the selected component as the parent', async () => {
    const { user, store } = renderShell()
    act(() => store.getState().select({ id: 'Header' }))
    await user.keyboard('n')
    expect(addDialog().getByLabelText('Rendered by')).toHaveValue('Header')

    await user.type(addDialog().getByLabelText('Id'), 'Logo{Enter}')
    expect(store.getState().valid?.graph.children.get('Header')?.map((l) => l.child)).toEqual(['SearchBox', 'CartBadge', 'Logo'])
  })

  it('asks for what each kind needs and says what is missing', async () => {
    const { user, store } = renderShell()
    act(() => store.getState().select({ id: 'OrdersPage' }))
    await user.keyboard('n')
    expect(addDialog().queryByLabelText('Type')).not.toBeInTheDocument()

    await user.click(addDialog().getByRole('radio', { name: 'State' }))
    expect(addDialog().queryByLabelText('Rendered by')).not.toBeInTheDocument()
    expect(addDialog().getByLabelText('Owned by')).toHaveValue('OrdersPage')

    await user.type(addDialog().getByLabelText('Id'), 'draft{Enter}')
    expect(addDialog().getByRole('alert')).toHaveTextContent('Give it a type')
    expect(store.getState().valid?.graph.byId.has('draft')).toBe(false)

    await user.type(addDialog().getByLabelText('Type'), 'Order | null{Enter}')
    expect(store.getState().valid?.graph.byId.get('draft')).toMatchObject({ kind: 'state', owner: 'OrdersPage', type: 'Order | null' })
  })

  it('labels the owner of a context as its provider', async () => {
    const { user } = renderShell()
    await user.keyboard('n')
    await user.click(addDialog().getByRole('radio', { name: 'Context' }))
    expect(addDialog().getByLabelText('Provided by')).toBeInTheDocument()
  })

  it('refuses an id that is taken, and clears the message when it is corrected', async () => {
    const { user } = renderShell()
    await user.keyboard('n')
    const id = addDialog().getByLabelText('Id')
    await user.type(id, 'App{Enter}')
    expect(addDialog().getByRole('alert')).toHaveTextContent('There is already a node called App.')

    await user.type(id, '2')
    expect(addDialog().getByRole('alert')).toBeEmptyDOMElement()
  })

  it('cancels without changing anything', async () => {
    const { user, store } = renderShell()
    const before = store.getState().yaml
    await user.keyboard('n')
    await user.type(addDialog().getByLabelText('Id'), 'Toast')
    await user.click(addDialog().getByRole('button', { name: 'Cancel' }))

    expect(store.getState().yaml).toBe(before)
    expect(screen.queryByRole('dialog', { name: 'Add a node' })).not.toBeInTheDocument()
  })

  it('builds a flow from an empty one', async () => {
    const { user, store } = renderShell({ yaml: NEW_FLOW_YAML })
    await user.keyboard('n')
    await user.type(addDialog().getByLabelText('Id'), 'App{Enter}')
    await user.keyboard('n')
    await user.type(addDialog().getByLabelText('Id'), 'Page{Enter}')

    expect(store.getState().yaml).toContain('nodes:\n  - id: App\n    kind: component\n    renders: [Page]\n  - id: Page\n    kind: component\n')
  })
})

describe('Connect', () => {
  it('needs a selected node', async () => {
    const { user, store } = renderShell()
    await user.keyboard('c')
    expect(screen.queryByRole('dialog', { name: 'Connect nodes' })).not.toBeInTheDocument()
    expect(store.getState().notice).toBe('Select a node first, then connect it.')
  })

  it('picks a node, then a relation, and writes the edge', async () => {
    const { user, store } = renderShell()
    act(() => store.getState().select({ id: 'orders' }))
    await user.keyboard('c')
    expect(connectDialog().getByRole('heading')).toHaveTextContent('Connect orders')

    await user.type(connectDialog().getByRole('combobox'), 'cartb{Enter}')
    expect(connectDialog().getByRole('heading')).toHaveTextContent('Connect orders and CartBadge')
    const options = connectDialog().getAllByRole('radio')
    expect(options.map((o) => o.closest('label')?.textContent)).toEqual(['CartBadge reads orders', 'CartBadge writes orders'])
    expect(options[0]).toBeChecked()

    await user.click(connectDialog().getByRole('button', { name: 'Connect' }))
    expect(store.getState().valid?.flow.edges.at(-1)).toMatchObject({ kind: 'reads', from: 'orders', to: 'CartBadge' })
    expect(store.getState().notice).toBe('Added: CartBadge reads orders')
    expect(store.getState().selection).toEqual({ id: 'orders' })
    expect(screen.queryByRole('dialog', { name: 'Connect nodes' })).not.toBeInTheDocument()
  })

  it('only offers nodes that can be connected', async () => {
    const { user, store } = renderShell()
    act(() => store.getState().select({ id: 'computeTotal' }))
    await user.keyboard('c')
    // An effect connects to data only: no components in the list.
    await user.type(connectDialog().getByRole('combobox'), 'order')
    expect(connectDialog().getAllByRole('option').map((o) => o.textContent)).toEqual(['ordersuseState', 'ordersQueryreact-query'])
  })

  it('asks for the prop name, and adds the render link the prop needs', async () => {
    const { user, store } = renderShell()
    act(() => store.getState().select({ id: 'Header' }))
    await user.keyboard('c')
    await user.type(connectDialog().getByRole('combobox'), 'OrderSummary{Enter}')
    await user.click(connectDialog().getByRole('radio', { name: 'Header passes a prop to OrderSummary' }))

    await user.click(connectDialog().getByRole('button', { name: 'Connect' }))
    expect(connectDialog().getByRole('alert')).toHaveTextContent('Prop name is needed.')

    await user.type(connectDialog().getByLabelText('Prop name'), 'label{Enter}')
    const { flow, graph } = store.getState().valid!
    expect(flow.edges.at(-1)).toMatchObject({ kind: 'prop', from: 'Header', to: 'OrderSummary', name: 'label' })
    expect(graph.children.get('Header')?.map((l) => l.child)).toContain('OrderSummary')
  })

  it('goes back to choose another node', async () => {
    const { user, store } = renderShell()
    act(() => store.getState().select({ id: 'orders' }))
    await user.keyboard('c')
    await user.type(connectDialog().getByRole('combobox'), 'cartb{Enter}')
    await user.click(connectDialog().getByRole('button', { name: 'Back' }))
    expect(connectDialog().getByRole('combobox')).toBeInTheDocument()
    expect(connectDialog().getByRole('heading')).toHaveTextContent(/^Connect orders$/)
  })
})

describe('shortcut letters', () => {
  it('are ordinary text while typing in a dialog', async () => {
    const { user, store } = renderShell()
    await user.keyboard('{Control>}k{/Control}')
    await user.type(screen.getByRole('combobox', { name: 'Find a node by id' }), 'nc')
    expect(screen.getByRole('combobox', { name: 'Find a node by id' })).toHaveValue('nc')
    expect(store.getState().dialog).toBe('search')
  })
})
