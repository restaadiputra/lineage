import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, flowYaml, test, type App } from './fixtures'

/** Add a comment at the end of the YAML: a harmless edit that makes the editor dirty. */
async function typeComment(app: App, text: string) {
  await app.editor.click()
  await app.page.keyboard.press('ControlOrMeta+End')
  await app.page.keyboard.insertText(`# ${text}\n`)
}

test.describe('without the File System Access API (Firefox, Safari)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'showOpenFilePicker')
      Reflect.deleteProperty(window, 'showSaveFilePicker')
    })
  })

  test('opens through an upload and saves as a download', async ({ app }) => {
    const chooser = app.page.waitForEvent('filechooser')
    await app.page.getByRole('button', { name: 'Open' }).click()
    await (await chooser).setFiles({
      name: 'tiny.flow.yaml',
      mimeType: 'application/yaml',
      buffer: Buffer.from(flowYaml('Uploaded', ['Shell', 'Page'])),
    })

    await app.ready(2)
    await expect(app.topBar).toContainText('Uploaded')
    await expect(app.topBar).toContainText('tiny.flow.yaml')
    await expect(app.topBar).not.toContainText('Unsaved changes')

    await typeComment(app, 'edited here')
    await expect(app.topBar).toContainText('Unsaved changes')

    const download = app.page.waitForEvent('download')
    await app.page.keyboard.press('ControlOrMeta+s')
    const saved = await download
    expect(saved.suggestedFilename()).toBe('tiny.flow.yaml')
    expect(await readFile(await saved.path(), 'utf8')).toBe(await app.storedYaml())
    await expect(app.topBar).not.toContainText('Unsaved changes')
    await expect(app.status).toContainText('Saved tiny.flow.yaml')
  })

  test('saving a never-opened flow suggests a name from the flow', async ({ app }) => {
    const download = app.page.waitForEvent('download')
    await app.page.getByRole('button', { name: 'Save' }).click()
    expect((await download).suggestedFilename()).toBe('orders-dashboard.flow.yaml')
  })
})

/**
 * The native pickers cannot be driven from a test. These swap the open picker
 * for one that returns a real file handle from the browser's private file
 * system, so reading, writing and watching run through the genuine API.
 */
test.describe('with a file handle', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'writable file handles exist only in Chromium browsers')
  const NAME = 'watched.flow.yaml'

  const writeFile = (page: Page, text: string) =>
    page.evaluate(
      async ([name, body]) => {
        const root = await navigator.storage.getDirectory()
        const writable = await (await root.getFileHandle(name, { create: true })).createWritable()
        await writable.write(body)
        await writable.close()
      },
      [NAME, text],
    )

  const readBack = (page: Page) =>
    page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory()
      return (await (await root.getFileHandle(name)).getFile()).text()
    }, NAME)

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((name) => {
      Object.assign(window, {
        showOpenFilePicker: async () => [await (await navigator.storage.getDirectory()).getFileHandle(name)],
      })
    }, NAME)
  })

  async function openWatchedFile(app: App) {
    await writeFile(app.page, flowYaml('On disk', ['Shell']))
    await app.page.getByRole('button', { name: 'Open' }).click()
    await app.ready(1)
    await expect(app.topBar).toContainText(NAME)
  }

  test('reloads by itself when another tool edits the file', async ({ app }) => {
    await openWatchedFile(app)
    await writeFile(app.page, flowYaml('From Copilot', ['Shell', 'Page', 'List']))

    await expect(app.nodes).toHaveCount(3)
    await expect(app.topBar).toContainText('From Copilot')
    await expect(app.status).toContainText('Reloaded: the file changed on disk')
    await expect(app.page.getByRole('alert')).toHaveCount(0)
  })

  test('asks before replacing unsaved edits, and Keep mine then saves over the file', async ({ app }) => {
    await openWatchedFile(app)
    await typeComment(app, 'mine')
    await expect(app.topBar).toContainText('Unsaved changes')
    await writeFile(app.page, flowYaml('Theirs', ['Shell', 'Page']))

    const banner = app.page.getByRole('alert')
    await expect(banner).toContainText('File changed on disk.')
    await expect(app.nodes).toHaveCount(1)

    await banner.getByRole('button', { name: 'Keep mine' }).click()
    await expect(banner).toHaveCount(0)
    await expect(app.topBar).toContainText('Unsaved changes')

    await app.page.getByRole('button', { name: 'Save' }).click()
    await expect(app.status).toContainText(`Saved ${NAME}`)
    expect(await readBack(app.page)).toContain('# mine')
    await expect(app.topBar).not.toContainText('Unsaved changes')

    // Its own write must not come back as an "external" change a second later.
    await app.page.waitForTimeout(1500)
    await expect(banner).toHaveCount(0)
  })

  test('Reload takes the version on disk', async ({ app }) => {
    await openWatchedFile(app)
    await typeComment(app, 'mine')
    await writeFile(app.page, flowYaml('Theirs', ['Shell', 'Page']))

    await app.page.getByRole('alert').getByRole('button', { name: 'Reload' }).click()
    await expect(app.nodes).toHaveCount(2)
    await expect(app.topBar).toContainText('Theirs')
    await expect(app.topBar).not.toContainText('Unsaved changes')
    expect(await app.storedYaml()).not.toContain('# mine')
  })
})

test('opens a file dropped on the window', async ({ app }) => {
  await app.page.evaluate((text) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([text], 'dropped.flow.yaml', { type: 'application/yaml' }))
    for (const type of ['dragover', 'drop'])
      window.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }))
  }, flowYaml('Dropped', ['Shell', 'Page']))

  await app.ready(2)
  await expect(app.topBar).toContainText('Dropped')
  await expect(app.topBar).toContainText('dropped.flow.yaml')
})

test.describe('layout file', () => {
  // The native save and open dialogs cannot be driven, so use the download / upload path everywhere.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'showOpenFilePicker')
      Reflect.deleteProperty(window, 'showSaveFilePicker')
    })
  })

  const flowMenu = async (app: App, item: string) => {
    await app.topBar.getByRole('button', { name: 'Orders dashboard' }).click()
    await app.page.getByRole('menuitem', { name: item }).click()
  }
  const transformOf = (app: App, id: string) => app.node(id).evaluate((element) => element.style.transform)

  test('exports positions and imports them back after a re-layout', async ({ app }) => {
    const laidOut = await transformOf(app, 'OrdersPage')

    // Arrange: move a node, then export.
    const box = (await app.node('OrdersPage').boundingBox())!
    await app.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await app.page.mouse.down()
    await app.page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 6 })
    await app.page.mouse.up()
    const arranged = await transformOf(app, 'OrdersPage')
    expect(arranged).not.toBe(laidOut)

    const download = app.page.waitForEvent('download')
    await flowMenu(app, 'Export layout…')
    const saved = await download
    expect(saved.suggestedFilename()).toBe('orders-dashboard.flow.layout.json')
    const layout = JSON.parse(await readFile(await saved.path(), 'utf8'))
    expect(layout).toMatchObject({ version: 1, flow: 'Orders dashboard' })
    expect(Object.keys(layout.positions)).toHaveLength(21)
    expect(Object.keys(layout.positions)).toEqual([...Object.keys(layout.positions)].sort())

    // Lose the arrangement, then bring it back from the file.
    await app.page.getByRole('button', { name: 'Re-layout' }).click()
    await expect.poll(() => transformOf(app, 'OrdersPage')).toBe(laidOut)

    const chooser = app.page.waitForEvent('filechooser')
    await flowMenu(app, 'Import layout…')
    await (await chooser).setFiles(await saved.path())

    await expect(app.status).toContainText('Layout applied to 21 of 21 nodes')
    const restored = layout.positions.OrdersPage
    await expect
      .poll(() => transformOf(app, 'OrdersPage'))
      .toBe(`translate(${restored.x}px, ${restored.y}px)`)
  })

  test('a layout file dropped on the window is applied, not opened as a flow', async ({ app }) => {
    await app.page.evaluate(() => {
      const text = JSON.stringify({ version: 1, flow: 'Orders dashboard', positions: { App: { x: 900, y: 500 } } })
      const transfer = new DataTransfer()
      transfer.items.add(new File([text], 'team.flow.layout.json', { type: 'application/json' }))
      for (const type of ['dragover', 'drop'])
        window.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }))
    })

    await expect(app.status).toContainText('Layout applied to 1 of 21 nodes')
    await expect.poll(() => transformOf(app, 'App')).toBe('translate(900px, 500px)')
    await expect(app.nodes).toHaveCount(21)
    await expect(app.topBar).not.toContainText('team.flow.layout.json')
  })
})
