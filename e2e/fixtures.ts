import { expect, test as base, type Locator, type Page } from '@playwright/test'

export const SAMPLE_NODES = 21

export const flowYaml = (name: string, nodeIds: string[] = []) =>
  [`version: 1`, `name: ${name}`, 'nodes:', ...nodeIds.map((id) => `  - { id: ${id}, kind: component }`), ''].join('\n')

/** Page object: the handful of places the tests look at and click. */
export class App {
  readonly page: Page
  readonly nodes: Locator
  readonly status: Locator
  readonly inspector: Locator
  readonly topBar: Locator
  readonly editor: Locator

  constructor(page: Page) {
    this.page = page
    this.nodes = page.locator('.react-flow__node')
    this.status = page.getByRole('status')
    this.inspector = page.getByRole('complementary', { name: 'Inspector' })
    this.topBar = page.getByRole('banner')
    this.editor = page.getByRole('textbox', { name: 'Flow YAML' })
  }

  /** The React Flow wrapper of a node: position, selection, viewport checks. */
  node(id: string): Locator {
    return this.page.locator(`.react-flow__node[data-id="${id}"]`)
  }

  /** The node's own box, which carries the focus state (data-roles, data-dimmed…). */
  frame(id: string): Locator {
    return this.node(id).locator('.lg-node')
  }

  section(title: string): Locator {
    return this.inspector.locator('section').filter({ has: this.page.getByRole('heading', { name: title }) })
  }

  /** Wait for the diagram to be drawn and its opening pan/zoom to finish. */
  async ready(nodeCount = SAMPLE_NODES) {
    await expect(this.nodes).toHaveCount(nodeCount)
    await this.settled()
  }

  /** Resolves once the canvas has stopped panning or zooming. */
  async settled() {
    const viewport = this.page.locator('.react-flow__viewport')
    let previous = ''
    await expect(async () => {
      const current = (await viewport.getAttribute('style')) ?? ''
      const moved = current !== previous
      previous = current
      expect(moved).toBe(false)
    }).toPass({ intervals: [120] })
  }

  async zoom(): Promise<number> {
    const style = (await this.page.locator('.react-flow__viewport').getAttribute('style')) ?? ''
    return Number(/scale\(([\d.]+)\)/.exec(style)?.[1])
  }

  /** At 1280px some nodes start off-screen, so zoom out before clicking one. */
  async selectOnCanvas(id: string) {
    await this.page.getByRole('button', { name: 'Fit all' }).click()
    await this.settled()
    await this.node(id).click()
    await expect(this.node(id)).toHaveClass(/selected/)
  }

  /** Replace the whole editor text, as if pasted. */
  async replaceYaml(text: string) {
    await this.editor.click()
    await this.page.keyboard.press('ControlOrMeta+a')
    await this.page.keyboard.insertText(text)
  }

  storedYaml(): Promise<string | null> {
    return this.page.evaluate(() => localStorage.getItem('lineage:yaml'))
  }
}

/**
 * Console messages that are advice from a browser about a technique, not a
 * fault in the app. Keep this list short and explain every entry.
 */
const BROWSER_ADVISORIES = [
  // Firefox, about the code editor keeping its gutter in place while scrolling.
  'scroll-linked positioning effect',
]

interface Fixtures {
  /**
   * The app, loaded with the sample. Fails the test if the browser console is
   * not clean or if the page requested anything from another origin.
   */
  app: App
}

export const test = base.extend<Fixtures>({
  // Playwright calls this callback `use`; it is named `provide` here so the
  // React hooks lint rule does not mistake it for React's `use` hook.
  app: async ({ page, baseURL }, provide) => {
    const problems: string[] = []
    // Lineage must work offline: nothing may be fetched from anywhere but the app itself.
    const external: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      const local = ['data:', 'blob:'].includes(url.protocol) || url.origin === new URL(baseURL ?? '').origin
      if (!local) external.push(request.url())
    })
    page.on('console', (message) => {
      const serious = message.type() === 'error' || message.type() === 'warning'
      if (serious && !BROWSER_ADVISORIES.some((advisory) => message.text().includes(advisory)))
        problems.push(`${message.type()}: ${message.text()}`)
    })
    page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`))

    const app = new App(page)
    await page.goto('/')
    await app.ready()
    await provide(app)

    expect(problems, 'browser console should be clean').toEqual([])
    expect(external, 'no request may leave the app').toEqual([])
  },
})

export { expect }
