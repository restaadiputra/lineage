// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CODE_YAML, PLAN_YAML } from '../../testing/compare-fixtures'
import { renderApp } from '../../testing/render-app'
import { AppShell } from '../shell/app-shell'
import { Inspector } from './inspector'

const section = (title: string) => within(screen.getByText(title).closest('section') as HTMLElement)

/** The real inspector inside the shell, with the plan loaded. */
const renderComparing = () =>
  renderApp(<AppShell editor={<p>editor</p>} canvas={<p>canvas</p>} inspector={<Inspector />} />, { yaml: PLAN_YAML })

async function startComparison(app: ReturnType<typeof renderComparing>) {
  app.disk.other = { name: 'cart.code.flow.yaml', text: CODE_YAML }
  await app.user.click(screen.getByRole('button', { name: 'Cart plan' }))
  await app.user.click(screen.getByRole('menuitem', { name: 'Compare with a flow file…' }))
  await screen.findByRole('tab', { name: 'Compare' })
}

describe('comparing plan and code', () => {
  it('has no Compare tab until a comparison starts', () => {
    renderComparing()
    expect(screen.queryByRole('tab', { name: 'Compare' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Comparison' })).not.toBeInTheDocument()
  })

  it('starts from the flow menu, opens the Compare tab and summarises in a bar', async () => {
    const app = renderComparing()
    await startComparison(app)

    expect(screen.getByRole('tab', { name: 'Compare' })).toHaveAttribute('aria-selected', 'true')
    const bar = within(screen.getByRole('region', { name: 'Comparison' }))
    expect(bar.getByText('cart.code.flow.yaml')).toBeInTheDocument()
    const { counts } = app.store.getState().comparison!.diff
    expect(bar.getByText(new RegExp(`${counts['plan-only']} items? only in the plan, ${counts['code-only']} only in the code, ${counts.changed} changed`))).toBeInTheDocument()
  })

  it('groups the differences and explains each change', async () => {
    const app = renderComparing()
    await startComparison(app)

    expect(section('Only in the plan').getByRole('button', { name: 'Planned' })).toBeInTheDocument()
    expect(section('Only in the plan').getByRole('button', { name: 'writes CartList → cart' })).toBeInTheDocument()
    expect(section('Only in the code').getByRole('button', { name: 'Total' })).toBeInTheDocument()
    expect(section('Only in the code').getByRole('button', { name: 'renders CartPage → Total' })).toBeInTheDocument()
    // A type has no node to go to, so it is plain text.
    expect(section('Only in the code').getByText('Money')).toBeInTheDocument()

    const cart = section('Changed').getByRole('button', { name: 'cart' }).closest('li') as HTMLElement
    expect(cart).toHaveTextContent('owner CartPage in the plan, App in the code')
    const list = section('Changed').getByRole('button', { name: 'CartList' }).closest('li') as HTMLElement
    expect(list).toHaveTextContent('memo yes, only in the plan')
  })

  it('goes to a difference: selects the node and asks the canvas to reveal it', async () => {
    const app = renderComparing()
    await startComparison(app)
    await app.user.click(section('Only in the code').getByRole('button', { name: 'Total' }))
    expect(app.store.getState().selection).toEqual({ id: 'Total' })
    expect(app.store.getState().revealToken).toBe(1)

    // An edge goes to the node it ends at.
    await app.user.click(section('Only in the code').getByRole('button', { name: 'mutates CartList → cart' }))
    expect(app.store.getState().selection).toEqual({ id: 'cart' })
  })

  it('shows how the selected node differs at the top of its details', async () => {
    const app = renderComparing()
    await startComparison(app)
    act(() => app.store.getState().select({ id: 'cart' }))
    await app.user.click(screen.getByRole('tab', { name: 'Details' }))

    expect(section('Differs in the code').getByText('owner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'cart' })).toBeInTheDocument()

    // A node only the code has still gets details, from the merged diagram.
    act(() => app.store.getState().select({ id: 'Total' }))
    expect(screen.getByText('Only in the code')).toBeInTheDocument()
    expect(section('Parents').getByRole('button', { name: 'CartPage' })).toBeInTheDocument()
  })

  it('reaches the Compare tab with the arrow keys', async () => {
    const app = renderComparing()
    await startComparison(app)
    screen.getByRole('tab', { name: 'Compare' }).focus()
    await app.user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus()
    await app.user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Compare' })).toHaveAttribute('aria-selected', 'true')
  })

  it('stops from the bar or the menu and removes the tab', async () => {
    const app = renderComparing()
    await startComparison(app)
    await app.user.click(screen.getByRole('button', { name: 'Stop comparing' }))
    expect(screen.queryByRole('tab', { name: 'Compare' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')

    await startComparison(app)
    await app.user.click(screen.getByRole('button', { name: 'Cart plan' }))
    await app.user.click(screen.getByRole('menuitem', { name: 'Stop comparing' }))
    expect(app.store.getState().comparison).toBeNull()
  })

  it('says so when plan and code agree', async () => {
    const app = renderComparing()
    app.disk.other = { name: 'same.flow.yaml', text: PLAN_YAML }
    await app.user.click(screen.getByRole('button', { name: 'Cart plan' }))
    await app.user.click(screen.getByRole('menuitem', { name: 'Compare with a flow file…' }))

    expect(await screen.findByText('They describe the same flow.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Comparison' })).getByText(/No differences\./)).toBeInTheDocument()
  })

  it('reports a code file that is not a valid flow', async () => {
    const app = renderComparing()
    app.disk.other = { name: 'broken.flow.yaml', text: 'nodes: [' }
    await app.user.click(screen.getByRole('button', { name: 'Cart plan' }))
    await app.user.click(screen.getByRole('menuitem', { name: 'Compare with a flow file…' }))

    await waitFor(() => expect(app.store.getState().notice).toMatch(/Could not compare with broken\.flow\.yaml/))
    expect(screen.queryByRole('tab', { name: 'Compare' })).not.toBeInTheDocument()
  })
})
