import { expect, test, type Page } from '@playwright/test'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { ToHost, ToWebview } from '../src/vscode/protocol'
import { assetsFromManifest, webviewHtml } from '../vscode/src/pure'

/**
 * The VS Code webview bundle, loaded in a browser with a stand-in for the
 * extension. The page is the one the extension writes, with the same content
 * security policy, so anything the policy would block in VS Code fails here.
 * (The extension itself is tested inside a real VS Code: npm run test:vscode.)
 */

const ORIGIN = 'http://localhost:5181'
const MEDIA = 'vscode/media'

async function sourceFiles(folder: string): Promise<{ path: string; text: string }[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
  return Promise.all(
    files.map(async (entry) => {
      const full = join(entry.parentPath, entry.name)
      return { path: relative(folder, full).replaceAll('\\', '/'), text: await readFile(full, 'utf8') }
    }),
  )
}

interface Host {
  posted(): Promise<ToHost[]>
  send(message: ToWebview): Promise<void>
  problems: string[]
}

/** Opens the webview with a fake VS Code behind it. */
async function openWebview(page: Page, init: Partial<Extract<ToWebview, { type: 'init' }>> = {}): Promise<Host> {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))

  const text = await readFile('src/samples/orders.flow.yaml', 'utf8')
  const folder = { name: 'orders-app', files: await sourceFiles('fixtures/orders-app') }
  const first: ToWebview = { type: 'init', text, fileName: 'orders.flow.yaml', storage: {}, layout: null, ...init }

  await page.addInitScript(
    ({ first, folder }) => {
      const posted: unknown[] = []
      Object.assign(window, {
        __posted: posted,
        acquireVsCodeApi: () => ({
          postMessage(message: { type: string; id?: number; request?: { kind: string } }) {
            posted.push(message)
            if (message.type === 'ready') window.postMessage(first, '*')
            // The fake answers a folder request with the fixture app; other dialogs are "cancelled".
            if (message.type === 'request')
              window.postMessage({ type: 'response', id: message.id, result: message.request?.kind === 'openFolder' ? folder : null }, '*')
          },
        }),
      })
      // VS Code marks the body with its theme.
      document.addEventListener('DOMContentLoaded', () => document.body.classList.add('vscode-dark'))
    },
    { first, folder },
  )

  // Serve the page exactly as the extension builds it, policy included.
  const assets = assetsFromManifest(JSON.parse(await readFile(join(MEDIA, '.vite', 'manifest.json'), 'utf8')))
  const html = webviewHtml({ script: `${ORIGIN}/${assets.script}`, styles: assets.styles.map((style) => `${ORIGIN}/${style}`), cspSource: ORIGIN })
  await page.route(`${ORIGIN}/extension-page`, (route) => route.fulfill({ contentType: 'text/html', body: html }))
  await page.goto(`${ORIGIN}/extension-page`)
  await expect(page.locator('.react-flow__node')).toHaveCount(21)

  return {
    posted: () => page.evaluate(() => (window as unknown as { __posted: ToHost[] }).__posted),
    send: (message) => page.evaluate((m) => window.postMessage(m, '*'), message),
    problems,
  }
}

const ofType = async <T extends ToHost['type']>(host: Host, type: T) =>
  (await host.posted()).filter((message): message is Extract<ToHost, { type: T }> => message.type === type)

// VS Code's webviews are Chromium. (Firefox also logs a library's harmless probe for eval as a policy error.)
test.skip(({ browserName }) => browserName !== 'chromium', 'VS Code webviews are Chromium')

test.afterEach(async ({ page }, testInfo) => {
  // A blocked script or style shows up as a console error naming the policy.
  const problems = (testInfo as unknown as { problems?: string[] }).problems
  expect(problems ?? [], 'browser console should be clean').toEqual([])
  await page.close()
})

test('loads under the extension page policy, without the controls VS Code already has', async ({ page }, testInfo) => {
  const host = await openWebview(page)
  Object.assign(testInfo, { problems: host.problems })

  const bar = page.getByRole('banner')
  await expect(bar.getByRole('button', { name: 'Orders dashboard' })).toBeVisible()
  for (const name of ['Open', 'Save', /^Theme:/]) await expect(bar.getByRole('button', { name })).toHaveCount(0)
  await expect(bar).not.toContainText('orders.flow.yaml')

  // The real text editor is next door, so the built-in one starts closed; the theme is VS Code's.
  await expect(page.getByRole('textbox', { name: 'Flow YAML' })).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const [status] = await ofType(host, 'status')
  expect(status.nodeCount).toBe(21)
  expect(status.problems.some((problem) => problem.code === 'mutation' && problem.severity === 'error')).toBe(true)
})

test('sends canvas edits and Save to VS Code', async ({ page }, testInfo) => {
  const host = await openWebview(page)
  Object.assign(testInfo, { problems: host.problems })

  await page.keyboard.press('n')
  await page.getByRole('dialog', { name: 'Add a node' }).getByLabel('Id', { exact: true }).fill('Toast')
  await page.keyboard.press('Enter')
  await expect(page.locator('.react-flow__node')).toHaveCount(22)

  await expect.poll(async () => (await ofType(host, 'edit')).at(-1)?.text).toContain('  - id: Toast\n    kind: component\n')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(async () => (await ofType(host, 'save')).length).toBe(1)
})

test('follows the document when VS Code changes it, without echoing it back', async ({ page }, testInfo) => {
  const host = await openWebview(page)
  Object.assign(testInfo, { problems: host.problems })

  await host.send({ type: 'document', text: 'version: 1\nname: From Copilot\nnodes:\n  - { id: Shell, kind: component }\n' })
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await expect(page.getByRole('banner').getByRole('button', { name: 'From Copilot' })).toBeVisible()
  expect(await ofType(host, 'edit')).toEqual([])
  await expect.poll(async () => (await ofType(host, 'status')).at(-1)?.nodeCount).toBe(1)
})

test('opens a node source in VS Code and copies through the extension', async ({ page }, testInfo) => {
  const host = await openWebview(page)
  Object.assign(testInfo, { problems: host.problems })

  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('combobox', { name: 'Find a node by id' }).fill('OrderList')
  await page.keyboard.press('Enter')
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await inspector.getByRole('button', { name: 'Open', exact: true }).click()
  await inspector.getByRole('button', { name: 'Copy' }).click()

  expect(await ofType(host, 'openSource')).toEqual([{ type: 'openSource', source: 'src/orders/OrderList.tsx:6' }])
  expect(await ofType(host, 'copy')).toEqual([{ type: 'copy', text: 'src/orders/OrderList.tsx:6' }])
})

test('remembers settings and positions through the extension, and restores them', async ({ page }, testInfo) => {
  const host = await openWebview(page, { storage: { 'lineage:settings': JSON.stringify({ editorOpen: true, inspectorWidth: 400 }) } })
  Object.assign(testInfo, { problems: host.problems })

  // Restored: the built-in editor is open because the remembered settings say so.
  await expect(page.getByRole('textbox', { name: 'Flow YAML' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toHaveCSS('width', '400px')

  // Stored: the layout's positions go to the extension, never the document text.
  await expect.poll(async () => (await ofType(host, 'store')).some((message) => message.key === 'lineage:positions:Orders dashboard')).toBe(true)
  expect((await ofType(host, 'store')).some((message) => message.key === 'lineage:yaml')).toBe(false)
})

test('reads a code folder through VS Code, with the reader running under the policy', async ({ page }, testInfo) => {
  const host = await openWebview(page)
  Object.assign(testInfo, { problems: host.problems })

  await page.getByRole('banner').getByRole('button', { name: 'Orders dashboard' }).click()
  await page.getByRole('menuitem', { name: 'Compare with a code folder…' }).click()

  await expect(page.getByRole('region', { name: 'Comparison' })).toContainText('orders-app/ (read from code)')
  await expect(page.getByRole('status')).toContainText('Read 12 components from orders-app')
  expect((await ofType(host, 'request')).map((message) => message.request.kind)).toEqual(['openFolder'])
})
