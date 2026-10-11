import { readFile } from 'node:fs/promises'
import { expect, SAMPLE_NODES, test, type App } from './fixtures'

/** The sample as an AI might describe the code that was built from it: a few things drifted. */
async function codeFlow(): Promise<string> {
  const plan = await readFile('src/samples/orders.flow.yaml', 'utf8')
  const edits: [from: string, to: string][] = [
    // A component the plan never mentioned.
    ['renders: [Header, OrdersPage]', 'renders: [Header, OrdersPage, Toast]'],
    ['\nedges:\n', '\n  - id: Toast\n    kind: component\n\nedges:\n'],
    // State that ended up owned somewhere else.
    ['  - id: selectedId\n    kind: state\n    owner: OrdersPage', '  - id: selectedId\n    kind: state\n    owner: OrderList'],
    // A read the code does not have, and a prop the plan does not have.
    ['  - { kind: reads, from: uiStore, to: Header }\n', '  - { kind: prop, from: App, to: Header, name: onLogout, callback: true }\n'],
  ]
  return edits.reduce((text, [from, to]) => {
    if (!text.includes(from)) throw new Error(`The sample no longer contains: ${from}`)
    return text.replace(from, to)
  }, plan)
}

test.beforeEach(async ({ page }) => {
  // The native open dialog cannot be driven, so use the upload path in every browser.
  await page.addInitScript(() => Reflect.deleteProperty(window, 'showOpenFilePicker'))
})

async function compareWithCode(app: App) {
  const chooser = app.page.waitForEvent('filechooser')
  await app.topBar.getByRole('button', { name: 'Orders dashboard' }).click()
  await app.page.getByRole('menuitem', { name: 'Compare with a flow file…' }).click()
  await (await chooser).setFiles({
    name: 'orders.code.flow.yaml',
    mimeType: 'application/yaml',
    buffer: Buffer.from(await codeFlow()),
  })
  await app.ready(SAMPLE_NODES + 1)
}

/** Nodes on the canvas marked as different (the inspector's legend swatches carry the same attribute). */
const differingNodes = (app: App) => app.nodes.locator('.lg-node[data-diff]')

const transformOf = (app: App, id: string) => app.node(id).evaluate((element) => element.style.transform)

test('draws plan and code as one diagram and marks what differs', async ({ app }, testInfo) => {
  const planPosition = await transformOf(app, 'App')
  await compareWithCode(app)

  const bar = app.page.getByRole('region', { name: 'Comparison' })
  await expect(bar).toContainText('orders.code.flow.yaml')
  await expect(app.inspector.getByRole('tab', { name: 'Compare' })).toHaveAttribute('aria-selected', 'true')

  // Nodes: tagged in words and colored.
  await expect(app.frame('Toast')).toHaveAttribute('data-diff', 'code-only')
  await expect(app.frame('Toast').locator('.lg-node__tag')).toHaveText('code only')
  await expect(app.frame('selectedId')).toHaveAttribute('data-diff', 'changed')
  await expect(app.frame('OrdersPage')).not.toHaveAttribute('data-diff')
  await expect(differingNodes(app)).toHaveCount(2)

  // Edges: the read only the plan has, the render link only the code has, the prop that was added.
  await expect(app.page.locator('.lg-edge[data-kind="reads"][data-diff="plan-only"]')).toHaveCount(1)
  await expect(app.page.locator('.lg-edge[data-kind="tree"][data-diff="code-only"]')).toHaveCount(1)
  await expect(app.page.locator('.lg-edge-label')).toHaveText(['+onLogout'])

  await app.page.getByRole('button', { name: 'Fit all' }).click()
  await app.settled()
  await testInfo.attach('compare', { body: await app.page.screenshot(), contentType: 'image/png' })

  // Stopping restores the plan exactly as it was arranged.
  await bar.getByRole('button', { name: 'Stop comparing' }).click()
  await app.ready()
  await expect(differingNodes(app)).toHaveCount(0)
  await expect(app.page.locator('.lg-edge[data-diff]')).toHaveCount(0)
  await expect(app.inspector.getByRole('tab', { name: 'Compare' })).toHaveCount(0)
  expect(await transformOf(app, 'App')).toBe(planPosition)
})

test('lists the differences and goes to one', async ({ app }) => {
  await compareWithCode(app)
  const only = (title: string) => app.section(title)

  await expect(only('Only in the code').getByRole('button', { name: 'Toast', exact: true })).toBeVisible()
  await expect(only('Only in the plan').getByRole('button', { name: 'reads uiStore → Header' })).toBeVisible()
  await expect(only('Changed').locator('li', { hasText: 'selectedId' }).first()).toContainText(
    'owner OrdersPage in the plan, OrderList in the code',
  )

  await only('Only in the code').getByRole('button', { name: 'Toast', exact: true }).click()
  await app.settled()
  await expect(app.node('Toast')).toHaveClass(/selected/)
  await expect(app.node('Toast')).toBeInViewport({ ratio: 0.99 })

  // Its details work even though the plan does not have it.
  await app.inspector.getByRole('tab', { name: 'Details' }).click()
  await expect(app.inspector.getByRole('heading', { level: 2 })).toHaveText('Toast')
  await expect(app.inspector).toContainText('Only in the code')
})

test('the impact view is off while comparing, and the comparison follows edits to the plan', async ({ app }) => {
  await compareWithCode(app)
  await app.selectOnCanvas('orders')
  await expect(app.page.locator('.lg-node[data-roles]')).toHaveCount(0)
  await expect(app.page.locator('.lg-node[data-dimmed]')).toHaveCount(0)

  // Fix the plan to match the code: selectedId is owned by OrderList.
  const before = await readFile('src/samples/orders.flow.yaml', 'utf8')
  await app.replaceYaml(before.replace('    owner: OrdersPage\n    type: string | null', '    owner: OrderList\n    type: string | null'))
  await expect(app.frame('selectedId')).not.toHaveAttribute('data-diff')
  await expect(differingNodes(app)).toHaveCount(1)
})
