import { FLOW_FILE_TYPE as FLOW } from '../app/file-names'
import type { FileGateway, FileRef, FileType, OpenedFile } from '../app/ports'
import { isReadable, type SourceInput } from '../reader/source-files'

/**
 * Files in the browser. Chrome and Edge have the File System Access API, which
 * gives a handle that can be written back to and watched. Elsewhere this falls
 * back to an upload input and a download, with a null handle.
 */

// Not in TypeScript's DOM library yet.
interface PickerWindow {
  showOpenFilePicker?(options?: object): Promise<FileSystemFileHandle[]>
  showSaveFilePicker?(options?: object): Promise<FileSystemFileHandle>
}
interface HandleItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>
}

/** A FileType in the shape the native pickers expect. */
const pickerTypes = (type: FileType) => [{ description: type.description, accept: { [type.mime]: type.extensions } }]

const pickers = () => window as unknown as PickerWindow
const handleOf = (ref: FileRef | null) => (ref?.handle as FileSystemFileHandle | null | undefined) ?? null

/** Closing a picker rejects with AbortError; that is a cancel, not a failure. */
async function unlessCancelled<T>(pick: () => Promise<T>): Promise<T | null> {
  try {
    return await pick()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

async function fromFile(file: File, handle: FileSystemFileHandle | null): Promise<OpenedFile> {
  return { ref: { name: file.name, handle }, text: await file.text(), lastModified: file.lastModified }
}

const fromHandle = async (handle: FileSystemFileHandle) => fromFile(await handle.getFile(), handle)

/** Fallback open: a hidden <input type="file">. */
function pickWithInput(type: FileType): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = type.extensions.join(',')
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

/** Larger than any hand-written source file; skips bundles that slipped past the path filter. */
const MAX_SOURCE_BYTES = 1_000_000

/**
 * A folder picker that works in every browser: a hidden input with `webkitdirectory`.
 * The browser hands over every file in the folder; only source files are read.
 */
function pickFolder(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.addEventListener('change', () => resolve([...(input.files ?? [])]))
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

async function readFolder(picked: File[]): Promise<{ name: string; files: SourceInput[] }> {
  // webkitRelativePath is "folder/src/App.tsx": the first segment is the folder that was picked.
  const name = picked[0]?.webkitRelativePath.split('/')[0] ?? 'code'
  const sources = picked
    .map((file) => ({ file, path: file.webkitRelativePath.split('/').slice(1).join('/') }))
    .filter(({ file, path }) => isReadable(path) && file.size <= MAX_SOURCE_BYTES)
  const files = await Promise.all(sources.map(async ({ file, path }) => ({ path, text: await file.text() })))
  return { name, files }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

async function write(handle: FileSystemFileHandle, text: string) {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
  return { ref: { name: handle.name, handle }, lastModified: (await handle.getFile()).lastModified }
}

export function createBrowserFiles(): FileGateway {
  return {
    async open() {
      const { showOpenFilePicker } = pickers()
      if (!showOpenFilePicker) {
        const file = await pickWithInput(FLOW)
        return file && fromFile(file, null)
      }
      const picked = await unlessCancelled(() => showOpenFilePicker.call(window, { types: pickerTypes(FLOW) }))
      return picked && fromHandle(picked[0])
    },

    async openText(type) {
      const { showOpenFilePicker } = pickers()
      const file = showOpenFilePicker
        ? await unlessCancelled(async () => (await showOpenFilePicker.call(window, { types: pickerTypes(type) }))[0].getFile())
        : await pickWithInput(type)
      return file && { name: file.name, text: await file.text() }
    },

    async saveText({ name, text }, type) {
      const { showSaveFilePicker } = pickers()
      if (!showSaveFilePicker) {
        download(name, text)
        return true
      }
      const picked = await unlessCancelled(() =>
        showSaveFilePicker.call(window, { suggestedName: name, types: pickerTypes(type) }),
      )
      if (picked) await write(picked, text)
      return !!picked
    },

    async fromDrop(transfer) {
      const item = [...transfer.items].find((i) => i.kind === 'file')
      if (!item) return null
      // Read both before awaiting: the DataTransfer is emptied once the drop event returns.
      const file = item.getAsFile()
      const handle = await (item as HandleItem).getAsFileSystemHandle?.()
      if (handle?.kind === 'file') return fromHandle(handle as FileSystemFileHandle)
      return file && fromFile(file, null)
    },

    async read(ref) {
      const handle = handleOf(ref)
      if (!handle) throw new Error(`${ref.name} cannot be re-read in this browser`)
      return fromHandle(handle)
    },

    async lastModified(ref) {
      const handle = handleOf(ref)
      return handle ? (await handle.getFile()).lastModified : null
    },

    async save(ref, text, suggestedName) {
      const existing = handleOf(ref)
      if (existing) return write(existing, text)

      const { showSaveFilePicker } = pickers()
      const name = ref?.name ?? suggestedName
      if (!showSaveFilePicker) {
        download(name, text)
        return { ref: { name, handle: null }, lastModified: Date.now() }
      }
      const picked = await unlessCancelled(() => showSaveFilePicker.call(window, { suggestedName: name, types: pickerTypes(FLOW) }))
      return picked && write(picked, text)
    },

    download,

    async openFolder() {
      const picked = await pickFolder()
      return picked && readFolder(picked)
    },
  }
}
