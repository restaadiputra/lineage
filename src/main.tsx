import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import formatDoc from '../docs/FORMAT.md?raw'
import { createRoot } from 'react-dom/client'
import { createBrowserClipboard } from './adapters/browser-clipboard'
import { createBrowserFiles } from './adapters/browser-files'
import { createLocalStorage } from './adapters/local-storage'
import App from './App.tsx'
import { createFileSession } from './app/file-session'
import { createFlowStore } from './app/flow-store'
import { createPositionRepository } from './app/position-repository'
import sampleYaml from './samples/orders.flow.yaml?raw'
import './styles/tokens.css'
import './styles/base.css'
import { AppContext, type AppServices } from './ui/app-context'

// Composition root: the only place that picks concrete implementations.
const storage = createLocalStorage()
const store = createFlowStore({ storage, sampleYaml })
const services: AppServices = {
  store,
  positions: createPositionRepository(storage),
  clipboard: createBrowserClipboard(),
  files: createFileSession({ store, files: createBrowserFiles() }),
  formatDoc,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppContext value={services}>
      <App />
    </AppContext>
  </StrictMode>,
)
