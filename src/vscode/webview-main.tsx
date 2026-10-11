import type { FlowStore } from '../app/flow-store'
import { composeServices, mountApp } from '../compose'
import { createHostClipboard, createHostFiles, createHostStorage } from './host-adapters'
import { createHostBridge, type VsCodeApi } from './host-bridge'
import type { ToWebview } from './protocol'
import { applySharedLayout } from './shared-layout'
import { connectDocument } from './sync'

declare function acquireVsCodeApi(): VsCodeApi

/** VS Code marks the webview's <body> with its theme; follow it instead of asking the OS. */
function followEditorTheme(store: FlowStore) {
  const apply = () => {
    const light = /\bvscode-(light|high-contrast-light)\b/.test(document.body.className)
    const theme = light ? 'light' : 'dark'
    if (store.getState().settings.theme !== theme) store.getState().updateSettings({ theme })
  }
  apply()
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] })
}

// Composition root for the VS Code webview: storage, files and the clipboard all go through the extension.
function start(init: Extract<ToWebview, { type: 'init' }>) {
  const storage = createHostStorage(bridge, init.storage, init.text)
  const services = composeServices({
    storage,
    files: createHostFiles(bridge, init),
    clipboard: createHostClipboard(bridge),
    host: { embedded: true, openSource: (source) => bridge.post({ type: 'openSource', source }) },
  })
  const { store } = services

  // The real text editor sits beside the diagram, so the built-in one starts closed.
  if (!('lineage:settings' in init.storage)) store.getState().updateSettings({ editorOpen: false })
  followEditorTheme(store)
  connectDocument(store, bridge, init.text)
  // Adopt the document as "the open file": its name is used for the layout file's name.
  void services.files.open().then(() => applySharedLayout(services.layout, storage, init.layout))
  mountApp(services)
}

const bridge = createHostBridge(acquireVsCodeApi(), window)
const stopWaiting = bridge.subscribe((message) => {
  if (message.type !== 'init') return
  stopWaiting()
  start(message)
})
bridge.post({ type: 'ready' })
