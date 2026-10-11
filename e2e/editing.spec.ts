import { expect, SAMPLE_NODES, test, type App } from './fixtures'

const addDialog = (app: App) => app.page.getByRole('dialog', { name: 'Add a node' })
const connectDialog = (app: App) => app.page.getByRole('dialog', { name: 'Connect nodes' })
const transformOf = (app: App, id: string) => app.node(id).evaluate((element) => element.style.transform)

test('builds a flow from nothing with the keyboard, and writes clean YAML', async ({ app }) => {
  await app.topBar.getByRole('button', { name: 'Orders dashboard' }).click()
  await app.page.getByRole('menuitem', { name: 'New flow' }).click()
  await expect(app.page.getByText('This flow has no nodes yet.')).toBeVisible()

  // N opens the form with the id field ready; Enter adds.
  await app.page.keyboard.press('n')
  await expect(addDialog(app).getByLabel('Id', { exact: true })).toBeFocused()
  await app.page.keyboard.type('App')
  await app.page.keyboard.press('Enter')
  await app.ready(1)
  await expect(app.node('App')).toHaveClass(/selected/)

  // The new node is selected, so the next one is offered as its child.
  await app.page.keyboard.press('n')
  await expect(addDialog(app).getByLabel('Rendered by')).toHaveValue('App')
  await app.page.keyboard.type('Page')
  await app.page.keyboard.press('Enter')
  await app.ready(2)
  await expect(app.page.locator('.lg-edge[data-kind="tree"]')).toHaveCount(1)

  // State owned by the selected component.
  await app.page.keyboard.press('n')
  await addDialog(app).getByRole('radio', { name: 'State' }).check()
  await expect(addDialog(app).getByLabel('Owned by')).toHaveValue('Page')
  await addDialog(app).getByLabel('Id', { exact: true }).fill('count')
  await addDialog(app).getByLabel('Type').fill('number')
  await app.page.keyboard.press('Enter')
  await app.ready(3)
  await expect(app.page.locator('.lg-edge[data-kind="ownership"]')).toHaveCount(1)

  // C connects the selected node: pick the other node, then the relation.
  await app.page.keyboard.press('c')
  await expect(connectDialog(app).getByRole('combobox')).toBeFocused()
  await app.page.keyboard.type('pag')
  await app.page.keyboard.press('Enter')
  await expect(connectDialog(app).getByRole('radio', { name: 'Page reads count' })).toBeFocused()
  await app.page.keyboard.press('Enter')

  await expect(app.status).toContainText('Added: Page reads count')
  await expect(app.page.locator('.lg-edge[data-kind="reads"]')).toHaveCount(1)
  expect(await app.storedYaml()).toBe(
    [
      'version: 1',
      'name: Untitled flow',
      '',
      'types: {}',
      'nodes:',
      '  - id: App',
      '    kind: component',
      '    renders: [Page]',
      '  - id: Page',
      '    kind: component',
      '  - id: count',
      '    kind: state',
      '    owner: Page',
      '    type: number',
      'edges:',
      '  - kind: reads',
      '    from: count',
      '    to: Page',
      '',
    ].join('\n'),
  )
})

test('adds a node to an existing flow without disturbing the arrangement', async ({ app }) => {
  const before = await transformOf(app, 'OrdersPage')
  await app.selectOnCanvas('App')

  await app.page.getByRole('button', { name: 'Add node' }).click()
  await addDialog(app).getByLabel('Id', { exact: true }).fill('Toast')
  await addDialog(app).getByRole('button', { name: 'Add', exact: true }).click()

  await app.ready(SAMPLE_NODES + 1)
  await app.settled()
  await expect(app.node('Toast')).toHaveClass(/selected/)
  await expect(app.node('Toast')).toBeInViewport({ ratio: 0.99 })
  expect(await transformOf(app, 'OrdersPage')).toBe(before)

  // The editor follows: the new node's line is highlighted, and the parent renders it.
  await expect(app.page.locator('.cm-lineage-node-line')).toHaveText('- id: Toast')
  expect(await app.storedYaml()).toContain('renders: [Header, OrdersPage, Toast]')
  await expect(app.status).toContainText(`${SAMPLE_NODES + 1} nodes`)
})

test('rejects a bad id in the form and keeps the dialog open', async ({ app }) => {
  await app.page.getByRole('button', { name: 'Add node' }).click()
  await addDialog(app).getByLabel('Id', { exact: true }).fill('App')
  await app.page.keyboard.press('Enter')

  await expect(addDialog(app).getByRole('alert')).toHaveText('There is already a node called App.')
  await expect(app.nodes).toHaveCount(SAMPLE_NODES)
  await app.page.keyboard.press('Escape')
  await expect(addDialog(app)).toBeHidden()
})

test('connects two components with a named prop', async ({ app }) => {
  await app.selectOnCanvas('Header')
  await app.page.getByRole('button', { name: 'Connect' }).click()
  await connectDialog(app).getByRole('combobox').fill('OrderSummary')
  await app.page.keyboard.press('Enter')
  await connectDialog(app).getByRole('radio', { name: 'Header passes a prop to OrderSummary' }).check()
  await connectDialog(app).getByLabel('Prop name').fill('label')
  await connectDialog(app).getByRole('button', { name: 'Connect' }).click()

  await expect(app.status).toContainText('Added: Header passes a prop to OrderSummary')
  // Header is still selected, so the new line to OrderSummary is lit and names the prop.
  await expect(app.page.locator('.lg-edge-label', { hasText: 'label' })).toBeVisible()
  const yaml = (await app.storedYaml())!
  expect(yaml).toContain('renders: [SearchBox, CartBadge, OrderSummary]')
  expect(yaml).toContain('  - { kind: prop, from: Header, to: OrderSummary, name: label }')
})

test('Connect without a selection explains what to do', async ({ app }) => {
  await app.page.getByRole('button', { name: 'Connect' }).click()
  await expect(connectDialog(app)).toBeHidden()
  await expect(app.status).toContainText('Select a node first, then connect it.')
})

test('a canvas edit can be undone in the editor', async ({ app }) => {
  await app.page.getByRole('button', { name: 'Add node' }).click()
  await addDialog(app).getByLabel('Id', { exact: true }).fill('Toast')
  await app.page.keyboard.press('Enter')
  await app.ready(SAMPLE_NODES + 1)

  await app.editor.click()
  await app.page.keyboard.press('ControlOrMeta+z')
  await expect(app.nodes).toHaveCount(SAMPLE_NODES)
  expect(await app.storedYaml()).not.toContain('Toast')
})

test('editing is off while comparing', async ({ app }) => {
  await app.page.addInitScript(() => Reflect.deleteProperty(window, 'showOpenFilePicker'))
  await app.page.reload()
  await app.ready()

  const chooser = app.page.waitForEvent('filechooser')
  await app.topBar.getByRole('button', { name: 'Orders dashboard' }).click()
  await app.page.getByRole('menuitem', { name: 'Compare with code…' }).click()
  await (await chooser).setFiles('src/samples/orders.flow.yaml')
  await expect(app.page.getByRole('region', { name: 'Comparison' })).toBeVisible()

  await expect(app.page.getByRole('button', { name: 'Add node' })).toBeDisabled()
  await expect(app.page.getByRole('button', { name: 'Connect' })).toBeDisabled()
})
