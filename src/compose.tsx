import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import formatDoc from '../docs/FORMAT.md?raw'
import { createLazyCodeReader } from './adapters/lazy-code-reader'
import App from './App.tsx'
import { createCodeSession } from './app/code-session'
import { createCompareSession } from './app/compare-session'
import { isLayoutFileName } from './app/file-names'
import { createFileSession } from './app/file-session'
import { createFlowStore } from './app/flow-store'
import { createLayoutExchange } from './app/layout-exchange'
import type { Clipboard, FileGateway, KeyValueStore } from './app/ports'
import { createPositionRepository } from './app/position-repository'
import sampleYaml from './samples/orders.flow.yaml?raw'
import './styles/tokens.css'
import './styles/base.css'
import { AppContext, type AppServices, type HostFeatures } from './ui/app-context'

/** What differs between the places Lineage runs: a browser tab, a VS Code webview. */
export interface Environment {
  storage: KeyValueStore
  files: FileGateway
  clipboard: Clipboard
  host: HostFeatures
}

/** Builds every service from the adapters of one environment. Shared by all entry points. */
export function composeServices({ storage, files, clipboard, host }: Environment): AppServices {
  const store = createFlowStore({ storage, sampleYaml })
  const positions = createPositionRepository(storage)
  const layout = createLayoutExchange({ store, positions, files })
  const session = createFileSession({
    store,
    files,
    // A layout file dropped on the window is applied instead of being opened as a flow.
    claimDrop({ ref, text }) {
      if (!isLayoutFileName(ref.name)) return false
      layout.apply({ name: ref.name, text })
      return true
    },
  })

  return {
    store,
    positions,
    clipboard,
    files: session,
    layout,
    compare: createCompareSession({ store, files }),
    code: createCodeSession({ store, files, reader: createLazyCodeReader(), session }),
    formatDoc,
    sampleYaml,
    host,
  }
}

export function mountApp(services: AppServices): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppContext value={services}>
        <App />
      </AppContext>
    </StrictMode>,
  )
}
