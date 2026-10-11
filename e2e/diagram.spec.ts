import { expect, flowYaml, SAMPLE_NODES, test } from './fixtures'

test('draws the sample and opens at a readable zoom', async ({ app }) => {
  await expect(app.status).toContainText('Valid')
  await expect(app.status).toContainText(`${SAMPLE_NODES} nodes`)
  await expect(app.status).toContainText('7 warnings')
  await expect(app.topBar).toContainText('Orders dashboard')
  expect(await app.page.locator('.lg-edge').count()).toBeGreaterThan(20)

  // The sample is too wide for this window: it must start readable, not shrunk to fit.
  expect(await app.zoom()).toBeGreaterThanOrEqual(0.75)
  await app.page.getByRole('button', { name: 'Fit all' }).click()
  await app.settled()
  expect(await app.zoom()).toBeLessThan(0.75)
  for (const id of ['syncOrders', 'SearchBox', 'QtyStepper']) await expect(app.node(id)).toBeInViewport({ ratio: 0.99 })
})

for (const scheme of ['light', 'dark'] as const) {
  test(`impact view of orders, ${scheme} theme`, async ({ app }, testInfo) => {
    await app.page.emulateMedia({ colorScheme: scheme })
    const canvasColor = { light: 'rgb(243, 245, 244)', dark: 'rgb(18, 22, 20)' }[scheme]
    await expect(app.page.locator('body')).toHaveCSS('background-color', canvasColor)

    await app.selectOnCanvas('orders')

    await expect(app.frame('orders')).toHaveAttribute('data-roles', 'source')
    await expect(app.frame('OrderList')).toHaveAttribute('data-roles', 'reader')
    await expect(app.frame('Layout')).toHaveAttribute('data-roles', 'carrier')
    await expect(app.frame('syncOrders')).toHaveAttribute('data-roles', 'writer')
    await expect(app.frame('QtyStepper')).toHaveAttribute('data-roles', 'writer reader')
    await expect(app.frame('total')).toHaveAttribute('data-roles', 'cascade')
    await expect(app.frame('OrdersPage')).toHaveAttribute('data-rerender', 'true')
    await expect(app.frame('SearchBox')).toHaveAttribute('data-dimmed', 'true')

    // The props that carry the data are named on their edges.
    await expect(app.page.locator('.lg-edge-label')).toHaveText(['orders', 'orders', 'orders', 'order', 'item'])
    await expect(app.page.locator('.lg-edge[data-kind="mutates"]')).toHaveAttribute('data-role', 'writer')

    // The editor follows the selection.
    await expect(app.page.locator('.cm-lineage-node-line')).toHaveText('- id: orders')
    await expect(app.inspector.getByRole('heading', { level: 2 })).toHaveText('orders')

    // Let the selection fade finish, then keep a picture for review.
    await expect(app.frame('SearchBox')).toHaveCSS('opacity', '0.3')
    await testInfo.attach(`impact-${scheme}`, { body: await app.page.screenshot(), contentType: 'image/png' })
  })
}

test('Escape clears the selection', async ({ app }) => {
  await app.selectOnCanvas('orders')
  await expect(app.page.locator('.lg-node[data-dimmed]')).not.toHaveCount(0)

  await app.page.keyboard.press('Escape')
  await expect(app.page.locator('.lg-node[data-dimmed]')).toHaveCount(0)
  await expect(app.page.locator('.cm-lineage-node-line')).toHaveCount(0)
  await expect(app.inspector).toContainText('Select a state, context, store or query')
})

test('selecting a component shows its neighbours and names the props it passes', async ({ app }) => {
  await app.selectOnCanvas('OrdersPage')
  await expect(app.frame('OrdersPage')).toHaveAttribute('data-roles', 'source')
  await expect(app.frame('App')).toHaveAttribute('data-roles', 'related')
  await expect(app.frame('Sidebar')).toHaveAttribute('data-dimmed', 'true')
  await expect(app.page.locator('.lg-edge-label')).toHaveText(['orders, onSelect', 'total'])
  await expect(app.page.locator('.lg-edge[data-kind="reads"][data-role="reader"]')).toHaveCount(1)
})

test('edge filters hide a group and are remembered', async ({ app }) => {
  const reads = app.page.locator('.lg-edge[data-kind="reads"]')
  const toggle = app.page.getByRole('button', { name: 'Reads' })
  await expect(reads).not.toHaveCount(0)

  await toggle.click()
  await expect(reads).toHaveCount(0)
  await expect(app.page.locator('.lg-edge[data-kind="tree"]')).not.toHaveCount(0)

  await app.page.reload()
  await app.ready()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(reads).toHaveCount(0)
})

test('a dragged node stays where it was put until Re-layout', async ({ app }) => {
  const node = app.node('OrdersPage')
  const position = () => node.evaluate((element) => element.style.transform)
  const laidOut = await position()

  const box = (await node.boundingBox())!
  await app.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await app.page.mouse.down()
  await app.page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40, { steps: 6 })
  await app.page.mouse.up()
  const moved = await position()
  expect(moved).not.toBe(laidOut)

  await app.page.reload()
  await app.ready()
  expect(await position()).toBe(moved)

  await app.page.getByRole('button', { name: 'Re-layout' }).click()
  await expect.poll(position).toBe(laidOut)
})

test('a broken edit keeps the last valid diagram; a fixed one redraws and persists', async ({ app }) => {
  await app.replaceYaml('version: 1\nnodes:\n  - id: App\n    kind: nonsense\n')

  await expect(app.status).toContainText('YAML error, showing the last valid diagram')
  await expect(app.nodes).toHaveCount(SAMPLE_NODES)
  await expect(app.page.locator('.cm-lint-marker-error')).toHaveCount(1)
  await expect(app.page.getByLabel('YAML editor').getByText('1 error')).toBeVisible()

  await app.replaceYaml(flowYaml('Two components', ['Shell', 'Page']))
  await expect(app.nodes).toHaveCount(2)
  await expect(app.status).toContainText('Valid')
  await expect(app.topBar).toContainText('Two components')

  await app.page.reload()
  await app.ready(2)
  await expect(app.topBar).toContainText('Two components')
})
