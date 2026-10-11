import { expect, SAMPLE_NODES, test, type App } from './fixtures'

/** The orders dashboard as real React code, with the same flaws as the sample flow. */
const FOLDER = 'fixtures/orders-app'

async function pickFolder(app: App, menuItem: string) {
  const chooser = app.page.waitForEvent('filechooser')
  await app.topBar.getByRole('button', { name: 'Orders dashboard' }).click()
  await app.page.getByRole('menuitem', { name: menuItem }).click()
  await (await chooser).setFiles(FOLDER)
}

test('cross-checks the open flow against code read without AI', async ({ app }) => {
  await pickFolder(app, 'Compare with a code folder…')

  const bar = app.page.getByRole('region', { name: 'Comparison' })
  await expect(bar).toContainText('orders-app/ (read from code)')
  await expect(app.status).toContainText('Read 12 components from orders-app; 1 thing could not be followed')

  // The sample and the code agree on most things; these are real differences.
  await expect(app.frame('syncTotal')).toHaveAttribute('data-diff', 'code-only')
  await expect(app.frame('computeTotal')).toHaveAttribute('data-diff', 'plan-only')
  await expect(app.frame('OrderList')).not.toHaveAttribute('data-diff')
  await expect(app.frame('orders')).not.toHaveAttribute('data-diff')

  await expect(app.section('Only in the code').getByRole('button', { name: 'prop onSearch: App → Header' })).toBeVisible()
  // The reader is honest about what it skipped.
  await expect(app.section('Not read from the code')).toContainText('App calls useCart(), a hook the reader does not follow')
})

test('starts a flow from a code folder and checks it against the rules', async ({ app }) => {
  await pickFolder(app, 'New flow from a code folder…')

  await app.ready(SAMPLE_NODES)
  await expect(app.topBar).toContainText('orders-app')
  await expect(app.status).toContainText('Read 12 components from orders-app')
  await expect(app.editor).toContainText('Read from source code by Lineage, without AI.')

  // Every node knows where it came from.
  await app.selectOnCanvas('OrderList')
  await expect(app.inspector).toContainText('src/orders/Layout.tsx:27')
  await expect(app.inspector).toContainText('component, memo')

  // The flaws written into the code are found by the rules.
  await app.inspector.getByRole('tab', { name: /Problems/ }).click()
  await expect(app.inspector.getByRole('button', { name: /QtyStepper mutates orders/ })).toBeVisible()
  await expect(app.inspector.getByRole('button', { name: /orders copies server data from ordersQuery/ })).toBeVisible()
  await expect(app.inspector.getByRole('button', { name: /orders is drilled through Layout → Sidebar/ })).toBeVisible()
})
