import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach } from 'vitest'
import { createMemoryStorage } from '../adapters/memory-storage'
import { createFileSession } from '../app/file-session'
import { createFlowStore } from '../app/flow-store'
import { createLayoutExchange } from '../app/layout-exchange'
import { createPositionRepository } from '../app/position-repository'
import sample from '../samples/orders.flow.yaml?raw'
import { AppContext, type AppServices } from '../ui/app-context'
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
}

/**
 * Renders UI with the same services main.tsx provides, but with in-memory
 * adapters, and returns them so a test can inspect or drive the outside world.
 */
export function renderApp(ui: ReactNode, { yaml, diskText = flowYaml('On disk') }: RenderAppOptions = {}) {
  const storage = createMemoryStorage(yaml === undefined ? {} : { 'lineage:yaml': yaml })
  const store = createFlowStore({ storage, sampleYaml: sample, debounceMs: 0 })
  const fake = fakeDisk(diskText)
  const copied: string[] = []
  const positions = createPositionRepository(storage)
  const services: AppServices = {
    store,
    positions,
    clipboard: { copy: async (text) => void copied.push(text) },
    files: createFileSession({ store, files: fake.files }),
    layout: createLayoutExchange({ store, positions, files: fake.files }),
    formatDoc: FORMAT_DOC,
    sampleYaml: sample,
  }

  // userEvent.setup() must run before render so its document hooks are in place.
  const user = userEvent.setup()
  const view = render(<AppContext value={services}>{ui}</AppContext>)
  return { ...view, user, store, services, copied, ...fake }
}
