import { expect, test } from './fixtures'

test('picking a field narrows the impact on the canvas', async ({ app }) => {
  await app.selectOnCanvas('orders')
  await expect(app.section('Reads it').getByRole('listitem')).toHaveCount(3)
  await expect(app.frame('QtyStepper')).toHaveAttribute('data-roles', 'writer reader')

  await app.section('Fields').getByRole('button', { name: /^status/ }).click()

  await expect(app.section('When this changes')).toContainText('orders[].status')
  await expect(app.section('Reads it').getByRole('listitem')).toHaveCount(2)
  // QtyStepper only touches orders[].items, so it is no longer on the route.
  await expect(app.frame('QtyStepper')).not.toHaveAttribute('data-roles', /writer|reader/)
  await expect(app.page.locator('.lg-edge[data-kind="mutates"]')).toHaveAttribute('data-dimmed', 'true')
})

test('a link in the inspector selects that node and pans to it', async ({ app }) => {
  await app.selectOnCanvas('orders')
  await app.section('Writes it').getByRole('button', { name: 'syncOrders' }).click()
  await app.settled()

  await expect(app.inspector.getByRole('heading', { level: 2 })).toHaveText('syncOrders')
  await expect(app.node('syncOrders')).toBeInViewport({ ratio: 0.99 })
  expect(await app.zoom()).toBeGreaterThanOrEqual(0.75)
})

test('a problem pans to its node and can be ignored for good', async ({ app }) => {
  await app.inspector.getByRole('tab', { name: 'Problems 11' }).click()
  await app.inspector.getByRole('button', { name: /Header subscribes to all of uiStore/ }).click()
  await app.settled()

  await expect(app.node('Header')).toHaveClass(/selected/)
  await expect(app.node('Header')).toBeInViewport({ ratio: 0.99 })
  await expect(app.inspector).toContainText('Select only what Header needs')

  await app.inspector.getByRole('button', { name: 'Ignore…' }).click()
  await app.inspector.getByLabel('Why is this acceptable here?').fill('Header shows every setting')
  await app.inspector.getByRole('button', { name: 'Ignore', exact: true }).click()

  await expect(app.inspector.getByRole('tab', { name: 'Problems 10' })).toBeVisible()
  await expect(app.inspector.getByText('Ignored (2)')).toBeVisible()
  await expect(app.status).toContainText('Added to the ignore list in the YAML')
  expect(await app.storedYaml()).toMatch(/- rule: whole-store\n {4}node: Header\n {4}reason: Header shows every setting\n$/)

  // It is in the file now, so it survives a reload.
  await app.page.reload()
  await app.ready()
  await expect(app.inspector.getByRole('tab', { name: 'Problems 10' })).toBeVisible()
})

test('search finds a node from the keyboard', async ({ app }) => {
  await app.page.keyboard.press('ControlOrMeta+k')
  const input = app.page.getByRole('combobox', { name: 'Find a node by id' })
  await expect(input).toBeFocused()

  await input.pressSequentially('qty')
  await expect(app.page.getByRole('option')).toHaveText(['QtySteppercomponent'])
  await app.page.keyboard.press('Enter')
  await app.settled()

  await expect(input).toBeHidden()
  await expect(app.inspector.getByRole('heading', { level: 2 })).toHaveText('QtyStepper')
  await expect(app.node('QtyStepper')).toBeInViewport({ ratio: 0.99 })
})

test('search closes on Escape without touching the selection', async ({ app }) => {
  await app.selectOnCanvas('orders')
  await app.page.getByRole('button', { name: /Search/ }).click()
  await expect(app.page.getByRole('combobox')).toBeFocused()

  await app.page.keyboard.press('Escape')
  await expect(app.page.getByRole('combobox')).toBeHidden()
  await expect(app.node('orders')).toHaveClass(/selected/)
})

test.describe('Ask AI', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })
  const clipboard = (page: import('@playwright/test').Page) => page.evaluate(() => navigator.clipboard.readText())

  test('copies both prompts with the real format spec', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Ask AI' }).click()
    await app.page.getByRole('menuitem', { name: 'Copy prompt: code → diagram' }).click()
    await expect(app.status).toContainText('Prompt copied')
    const codeToDiagram = await clipboard(app.page)
    expect(codeToDiagram).toContain('# Lineage flow format (version 1)')
    expect(codeToDiagram).toContain('Files to read:')

    await app.page.getByRole('button', { name: 'Ask AI' }).click()
    await app.page.getByRole('menuitem', { name: 'Copy prompt: diagram → code' }).click()
    await expect(app.status).toContainText('Prompt copied with the current diagram')
    const diagramToCode = await clipboard(app.page)
    expect(diagramToCode).toContain('name: Orders dashboard')
    expect(diagramToCode).toContain('# Lineage flow format (version 1)')
  })

  test('downloads FORMAT.md', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Ask AI' }).click()
    const download = app.page.waitForEvent('download')
    await app.page.getByRole('menuitem', { name: 'Download FORMAT.md' }).click()
    expect((await download).suggestedFilename()).toBe('FORMAT.md')
  })
})
