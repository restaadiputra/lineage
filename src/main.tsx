import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import formatDoc from '../docs/FORMAT.md?raw'
import { createRoot } from 'react-dom/client'
import { createBrowserClipboard } from './adapters/browser-clipboard'
import { createBrowserFiles } from './adapters/browser-files'
import { createLazyCodeReader } from './adapters/lazy-code-reader'
import { createLocalStorage } from './adapters/local-storage'
import App from './App.tsx'
import { createCodeSession } from './app/code-session'
import { createCompareSession } from './app/compare-session'
import { isLayoutFileName } from './app/file-names'
import { createFileSession } from './app/file-session'
import { createFlowStore } from './app/flow-store'
import { createLayoutExchange } from './app/layout-exchange'
import { createPositionRepository } from './app/position-repository'
import sampleYaml from './samples/orders.flow.yaml?raw'
import './styles/tokens.css'
import './styles/base.css'
import { AppContext, type AppServices } from './ui/app-context'

// Composition root: the only place that picks concrete implementations.
const storage = createLocalStorage()
const store = createFlowStore({ storage, sampleYaml })
const positions = createPositionRepository(storage)
const browserFiles = createBrowserFiles()
const layout = createLayoutExchange({ store, positions, files: browserFiles })

/** A layout file dropped on the window is applied instead of being opened as a flow. */
const claimDrop = ({ ref, text }: { ref: { name: string }; text: string }) => {
  if (!isLayoutFileName(ref.name)) return false
  layout.apply({ name: ref.name, text })
  return true
}

const session = createFileSession({ store, files: browserFiles, claimDrop })

const services: AppServices = {
  store,
  positions,
  clipboard: createBrowserClipboard(),
  files: session,
  layout,
  compare: createCompareSession({ store, files: browserFiles }),
  code: createCodeSession({ store, files: browserFiles, reader: createLazyCodeReader(), session }),
  formatDoc,
  sampleYaml,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppContext value={services}>
      <App />
    </AppContext>
  </StrictMode>,
)
