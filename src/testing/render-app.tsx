import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach } from 'vitest'
import { createMemoryStorage } from '../adapters/memory-storage'
import { createCodeSession } from '../app/code-session'
import { createCompareSession } from '../app/compare-session'
import { createFileSession } from '../app/file-session'
import { createFlowStore } from '../app/flow-store'
import { createLayoutExchange } from '../app/layout-exchange'
import { createPositionRepository } from '../app/position-repository'
import type { SourceInput } from '../reader/source-files'
import sample from '../samples/orders.flow.yaml?raw'
import { AppContext, type AppServices, type HostFeatures } from '../ui/app-context'
import { fakeDisk } from './fake-disk'

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.theme
})

// jsdom does not implement modal dialogs.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}

export const flowYaml = (name: string) => `version: 1\nname: ${name}\n`
export const FORMAT_DOC = '# Lineage flow format (test copy)'

interface RenderAppOptions {
  /** YAML "saved from the last session"; the orders sample when omitted */
  yaml?: string
  /** contents of the fake file behind Open / Save */
  diskText?: string
  /** defaults to a plain browser tab */
  host?: HostFeatures
}

/**
 * Renders UI with the same services main.tsx provides, but with in-memory
 * adapters, and returns them so a test can inspect or drive the outside world.
 */
export function renderApp(ui: ReactNode, options: RenderAppOptions = {}) {
  const { yaml, diskText = flowYaml('On disk') } = options
  const storage = createMemoryStorage(yaml === undefined ? {} : { 'lineage:yaml': yaml })
  const store = createFlowStore({ storage, sampleYaml: sample, debounceMs: 0 })
  const fake = fakeDisk(diskText)
  const copied: string[] = []
  const positions = createPositionRepository(storage)
  const session = createFileSession({ store, files: fake.files })
  // The real reader, loaded directly: tests run in Node, where its size does not matter.
  const reader = { read: async (files: SourceInput[], name: string) => (await import('../reader/read-code')).readCode(files, name) }
  const services: AppServices = {
    store,
    positions,
    clipboard: { copy: async (text) => void copied.push(text) },
    files: session,
    layout: createLayoutExchange({ store, positions, files: fake.files }),
    compare: createCompareSession({ store, files: fake.files }),
    code: createCodeSession({ store, files: fake.files, reader, session }),
    formatDoc: FORMAT_DOC,
    sampleYaml: sample,
    host: options.host ?? { embedded: false },
  }

  // userEvent.setup() must run before render so its document hooks are in place.
  const user = userEvent.setup()
  const view = render(<AppContext value={services}>{ui}</AppContext>)
  return { ...view, user, store, services, copied, ...fake }
}
