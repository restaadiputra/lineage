import { createBrowserClipboard } from './adapters/browser-clipboard'
import { createBrowserFiles } from './adapters/browser-files'
import { createLocalStorage } from './adapters/local-storage'
import { composeServices, mountApp } from './compose'

// Composition root for the browser: the only place that picks these adapters.
mountApp(
  composeServices({
    storage: createLocalStorage(),
    files: createBrowserFiles(),
    clipboard: createBrowserClipboard(),
    host: { embedded: false },
  }),
)
