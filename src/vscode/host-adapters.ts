import type { Clipboard, FileGateway, KeyValueStore, OpenedFile } from '../app/ports'
import type { HostBridge } from './host-bridge'

/** The document itself lives in VS Code, not in remembered storage. */
const YAML_KEY = 'lineage:yaml'

/**
 * Storage kept by the extension (VS Code's workspace state). Reads must be
 * synchronous, so the host sends everything up front and writes are mirrored
 * back to it.
 */
export function createHostStorage(bridge: HostBridge, snapshot: Record<string, string>, documentText: string): KeyValueStore {
  const values = new Map(Object.entries(snapshot))
  values.set(YAML_KEY, documentText)
  const write = (key: string, value: string | null) => {
    if (value === null) values.delete(key)
    else values.set(key, value)
    if (key !== YAML_KEY) bridge.post({ type: 'store', key, value })
  }
  return {
    read: (key) => values.get(key) ?? null,
    write,
    remove: (key) => write(key, null),
  }
}

export function createHostClipboard(bridge: HostBridge): Clipboard {
  return {
    // Webviews are not always allowed to use the clipboard directly; the extension always is.
    copy: async (text) => bridge.post({ type: 'copy', text }),
  }
}

/** Reads a dropped file with the browser's own API; there is nothing VS Code-specific about a drop. */
async function fromDrop(transfer: DataTransfer): Promise<OpenedFile | null> {
  const file = [...transfer.items].find((item) => item.kind === 'file')?.getAsFile()
  return file ? { ref: { name: file.name, handle: null }, text: await file.text(), lastModified: file.lastModified } : null
}

/**
 * Files, as far as a webview is concerned: the document belongs to VS Code
 * (which saves and watches it), and every dialog is VS Code's.
 */
export function createHostFiles(bridge: HostBridge, document: { fileName: string; text: string }): FileGateway {
  let opened = false
  const ref = { name: document.fileName, handle: null }
  return {
    // Called once at start-up to adopt the document. "Open" has no meaning after that: VS Code opens files.
    async open() {
      if (opened) return null
      opened = true
      return { ref, text: document.text, lastModified: Date.now() }
    },
    fromDrop,
    read: async () => {
      throw new Error('The document is kept in sync by VS Code')
    },
    // VS Code tells the webview when the document changes; there is nothing to poll.
    lastModified: async () => null,
    async save() {
      bridge.post({ type: 'save' })
      return { ref, lastModified: Date.now() }
    },
    download: (name, text) => void bridge.request({ kind: 'saveText', file: { name, text }, fileType: { description: 'File', mime: 'text/plain', extensions: [] } }),
    openText: (fileType) => bridge.request({ kind: 'openText', fileType }),
    saveText: (file, fileType) => bridge.request({ kind: 'saveText', file, fileType }),
    openFolder: () => bridge.request({ kind: 'openFolder' }),
  }
}
