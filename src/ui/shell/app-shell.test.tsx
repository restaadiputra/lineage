// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FORMAT_DOC, flowYaml, renderApp } from '../../testing/render-app'
import { AppShell } from './app-shell'

/** The shell with stand-in panels: these tests are about the chrome around them. */
const renderShell = (options?: Parameters<typeof renderApp>[1]) =>
  renderApp(<AppShell editor={<p>editor panel</p>} canvas={<p>canvas panel</p>} inspector={<p>inspector panel</p>} />, options)

const statusBar = () => within(screen.getByRole('status'))

describe('status bar', () => {
  afterEach(() => void vi.useRealTimers())

  it('counts nodes, edges and problems by severity', () => {
    renderShell()
    for (const text of ['Valid', '21 nodes', '22 edges', '1 error', '7 warnings', '3 notes'])
      expect(statusBar().getByText(text)).toBeInTheDocument()
  })

  it('reports YAML errors and that the last valid diagram is still shown', () => {
    const { store } = renderShell()
    act(() => store.getState().loadYaml('nodes: ['))
    expect(statusBar().getByText(/YAML errors?, showing the last valid diagram/)).toBeInTheDocument()
    expect(statusBar().getByText('21 nodes')).toBeInTheDocument()
  })

  it('shows a notice and clears it after a few seconds', () => {
    vi.useFakeTimers()
    const { store } = renderShell()
    act(() => store.getState().notify('Prompt copied'))
    expect(statusBar().getByText('Prompt copied')).toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(4000))
    expect(statusBar().queryByText('Prompt copied')).not.toBeInTheDocument()
  })
})

describe('top bar', () => {
  it('cycles the theme and mirrors it onto <html>', async () => {
    const { user, store } = renderShell()
    const root = document.documentElement
    expect(root.dataset.theme).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'Theme: System' }))
    expect(root.dataset.theme).toBe('light')
    await user.click(screen.getByRole('button', { name: 'Theme: Light' }))
    expect(root.dataset.theme).toBe('dark')
    expect(store.getState().settings.theme).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Theme: Dark' }))
    expect(root.dataset.theme).toBeUndefined()
  })

  it('collapses and restores the editor panel', async () => {
    const { user } = renderShell()
    const toggle = screen.getByRole('button', { name: 'YAML editor' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle)
    expect(screen.queryByText('editor panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('separator', { name: 'Resize YAML editor' })).not.toBeInTheDocument()

    await user.keyboard('{Control>}e{/Control}')
    expect(screen.getByText('editor panel')).toBeInTheDocument()
  })

  it('shows the open file and marks unsaved changes', async () => {
    const { user, store } = renderShell()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByText('orders.flow.yaml')).toBeInTheDocument()
    expect(screen.getByText('On disk')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()

    act(() => store.getState().loadYaml(flowYaml('Edited')))
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('saves with the button and with Ctrl+S', async () => {
    const { user, store, disk } = renderShell()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(disk.text).toBe(store.getState().yaml))
    expect(statusBar().getByText('Saved orders.flow.yaml')).toBeInTheDocument()

    act(() => store.getState().loadYaml(flowYaml('Second')))
    await user.keyboard('{Control>}s{/Control}')
    await waitFor(() => expect(disk.text).toBe(flowYaml('Second')))
  })

  it('opens with Ctrl+O', async () => {
    const { user, store } = renderShell()
    await user.keyboard('{Control>}o{/Control}')
    await waitFor(() => expect(store.getState().valid?.flow.name).toBe('On disk'))
  })
})

describe('panels', () => {
  it('resizes with the arrow keys and remembers the width', async () => {
    const { user, store } = renderShell()
    const before = store.getState().settings.editorWidth
    screen.getByRole('separator', { name: 'Resize YAML editor' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(store.getState().settings.editorWidth).toBe(before + 16)

    // The inspector is on the right, so the same key makes it narrower.
    const inspector = store.getState().settings.inspectorWidth
    screen.getByRole('separator', { name: 'Resize inspector' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(store.getState().settings.inspectorWidth).toBe(inspector - 16)
  })

  it('stops at the minimum width', async () => {
    const { user, store } = renderShell()
    act(() => store.getState().updateSettings({ editorWidth: 240 }))
    screen.getByRole('separator', { name: 'Resize YAML editor' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(store.getState().settings.editorWidth).toBe(240)
  })
})

describe('search', () => {
  it('opens with Ctrl+K, finds a node and selects it on Enter', async () => {
    const { user, store } = renderShell()
    await user.keyboard('{Control>}k{/Control}')
    // Focus moving into the dialog is the browser's job; the Playwright tests check it.
    const input = screen.getByRole('combobox', { name: 'Find a node by id' })

    await user.type(input, 'qty')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Enter}')

    expect(store.getState().selection).toEqual({ id: 'QtyStepper' })
    expect(store.getState().revealToken).toBe(1)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('moves through results with the arrow keys', async () => {
    const { user, store } = renderShell()
    await user.click(screen.getByRole('button', { name: /Search/ }))
    await user.type(screen.getByRole('combobox'), 'orders')
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(options.at(-1)).toHaveAttribute('aria-selected', 'true')

    await user.click(options[1])
    expect(store.getState().selection).toEqual({ id: 'OrdersPage' })
  })

  it('says when nothing matches', async () => {
    const { user } = renderShell()
    await user.keyboard('{Control>}k{/Control}')
    await user.type(screen.getByRole('combobox'), 'zzz')
    expect(screen.getByText('No node matches “zzz”.')).toBeInTheDocument()
  })
})

describe('Ask AI menu', () => {
  const openMenu = async (user: ReturnType<typeof renderShell>['user']) => {
    await user.click(screen.getByRole('button', { name: 'Ask AI' }))
    return screen.getAllByRole('menuitem')
  }

  it('copies the code → diagram prompt with the format spec', async () => {
    const { user, copied } = renderShell()
    const [codeToDiagram] = await openMenu(user)
    expect(codeToDiagram).toHaveFocus()

    await user.click(codeToDiagram)
    await waitFor(() => expect(copied).toHaveLength(1))
    expect(copied[0]).toContain(FORMAT_DOC)
    expect(copied[0]).toContain('Files to read:')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(statusBar().getByText(/Prompt copied/)).toBeInTheDocument()
  })

  it('copies the diagram → code prompt with the current YAML', async () => {
    const { user, copied } = renderShell({ yaml: flowYaml('My plan') })
    const [, diagramToCode] = await openMenu(user)
    await user.click(diagramToCode)
    await waitFor(() => expect(copied).toHaveLength(1))
    expect(copied[0]).toContain('name: My plan')
    expect(copied[0]).toContain(FORMAT_DOC)
  })

  it('downloads FORMAT.md, reached with the keyboard', async () => {
    const { user, disk } = renderShell()
    await openMenu(user)
    await user.keyboard('{End}{Enter}')
    expect(disk.downloads).toEqual(['FORMAT.md'])
  })

  it('wraps focus with the arrow keys and closes on an outside click', async () => {
    const { user } = renderShell()
    const items = await openMenu(user)
    await user.keyboard('{ArrowUp}')
    expect(items.at(-1)).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[0]).toHaveFocus()

    await user.click(screen.getByText('canvas panel'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Escape', () => {
  it('clears the selection', async () => {
    const { user, store } = renderShell()
    act(() => store.getState().select({ id: 'orders' }))
    await user.keyboard('{Escape}')
    expect(store.getState().selection).toBeNull()
  })

  it('closes an open menu first and leaves the selection alone', async () => {
    const { user, store } = renderShell()
    act(() => store.getState().select({ id: 'orders' }))
    await user.click(screen.getByRole('button', { name: 'Ask AI' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(store.getState().selection).toEqual({ id: 'orders' })
    expect(screen.getByRole('button', { name: 'Ask AI' })).toHaveFocus()
  })
})

describe('file changed on disk', () => {
  async function openThenDiverge() {
    const app = renderShell()
    await app.user.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByText('orders.flow.yaml')
    act(() => app.store.getState().loadYaml(flowYaml('Mine')))
    app.edit(flowYaml('Theirs'))
    await act(() => app.services.files.checkDisk())
    return app
  }

  it('offers Reload, which takes the disk version', async () => {
    const { user, store } = await openThenDiverge()
    const banner = within(screen.getByRole('alert'))
    expect(banner.getByText('File changed on disk.')).toBeInTheDocument()

    await user.click(banner.getByRole('button', { name: 'Reload' }))
    expect(store.getState().valid?.flow.name).toBe('Theirs')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('offers Keep mine, which keeps the edits unsaved', async () => {
    const { user, store } = await openThenDiverge()
    await user.click(screen.getByRole('button', { name: 'Keep mine' }))
    expect(store.getState().valid?.flow.name).toBe('Mine')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('reloads quietly when there is nothing to lose', async () => {
    const { user, store, edit, services } = renderShell()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByText('orders.flow.yaml')
    edit(flowYaml('From Copilot'))
    await act(() => services.files.checkDisk())

    expect(store.getState().valid?.flow.name).toBe('From Copilot')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('drag and drop', () => {
  const transfer = { types: ['Files'], items: [] }

  it('marks the window while a file is dragged over it and opens it on drop', async () => {
    const { container, store } = renderShell()
    const shell = container.firstElementChild as HTMLElement

    fireEvent.dragOver(window, { dataTransfer: transfer })
    expect(shell).toHaveAttribute('data-dropping')

    fireEvent.drop(window, { dataTransfer: transfer })
    expect(shell).not.toHaveAttribute('data-dropping')
    await waitFor(() => expect(store.getState().file?.name).toBe('orders.flow.yaml'))
  })

  it('ignores drags that carry no file', () => {
    const { container } = renderShell()
    fireEvent.dragOver(window, { dataTransfer: { types: ['text/plain'], items: [] } })
    expect(container.firstElementChild).not.toHaveAttribute('data-dropping')
  })
})
