import type { FlowStore } from './flow-store'
import type { FileGateway, FileRef, OpenedFile } from './ports'

export interface FileSessionDeps {
  store: FlowStore
  files: FileGateway
  pollMs?: number
}

/** Open, save and watch the flow file behind the editor. */
export interface FileSession {
  open(): Promise<void>
  openDropped(transfer: DataTransfer): Promise<void>
  save(): Promise<void>
  /** Take the newer text from disk, dropping unsaved edits. */
  reloadFromDisk(): void
  /** Keep the editor's text; the next save overwrites the disk version. */
  keepMine(): void
  /** Look for an external edit once. startWatching() calls this every second. */
  checkDisk(): Promise<void>
  /** Returns a function that stops watching. */
  startWatching(): () => void
  download(name: string, text: string): void
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

function fileNameFor(flowName: string): string {
  const slug = flowName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'untitled'}.flow.yaml`
}

export function createFileSession({ store, files, pollMs = 1000 }: FileSessionDeps): FileSession {
  let ref: FileRef | null = null
  let lastModified = 0
  let checking = false
  const state = () => store.getState()

  const adopt = (opened: OpenedFile | null) => {
    if (!opened) return
    ref = opened.ref
    lastModified = opened.lastModified
    state().loadYaml(opened.text)
    state().setFile({ name: opened.ref.name, savedText: opened.text })
    state().setDiskText(null)
  }

  /** Run a file action; a failure becomes a notice instead of an unhandled rejection. */
  const attempt = async (what: string, action: () => Promise<void>) => {
    try {
      await action()
    } catch (error) {
      state().notify(`Could not ${what}: ${reasonOf(error)}`)
    }
  }

  const onDiskChange = (opened: OpenedFile) => {
    lastModified = opened.lastModified
    const { yaml, file } = state()
    const name = opened.ref.name
    if (opened.text === yaml) {
      state().setFile({ name, savedText: yaml })
    } else if (file && yaml !== file.savedText) {
      // Unsaved edits: never overwrite them silently, let the user choose.
      state().setDiskText(opened.text)
    } else {
      state().loadYaml(opened.text)
      state().setFile({ name, savedText: opened.text })
      state().notify('Reloaded: the file changed on disk')
    }
  }

  const session: FileSession = {
    open: () => attempt('open the file', async () => adopt(await files.open())),

    openDropped: (transfer) => attempt('open the dropped file', async () => adopt(await files.fromDrop(transfer))),

    save: () =>
      attempt('save', async () => {
        const { yaml, file, valid } = state()
        const saved = await files.save(ref, yaml, file?.name ?? fileNameFor(valid?.flow.name ?? ''))
        if (!saved) return
        ref = saved.ref
        lastModified = saved.lastModified
        state().setFile({ name: saved.ref.name, savedText: yaml })
        state().setDiskText(null)
        state().notify(`Saved ${saved.ref.name}`)
      }),

    reloadFromDisk() {
      const { diskText, file } = state()
      if (diskText === null || !file) return
      state().loadYaml(diskText)
      state().setFile({ ...file, savedText: diskText })
      state().setDiskText(null)
    },

    keepMine() {
      const { diskText, file } = state()
      if (diskText === null || !file) return
      state().setFile({ ...file, savedText: diskText })
      state().setDiskText(null)
    },

    async checkDisk() {
      if (!ref || checking) return
      checking = true
      try {
        const modified = await files.lastModified(ref)
        if (modified !== null && modified > lastModified) onDiskChange(await files.read(ref))
      } catch {
        // The file was moved, deleted or permission was withdrawn. Keep the
        // editor's text and stay quiet; saving will report a real failure.
      } finally {
        checking = false
      }
    },

    startWatching() {
      const timer = setInterval(() => void session.checkDisk(), pollMs)
      return () => clearInterval(timer)
    },

    download: (name, text) => files.download(name, text),
  }
  return session
}
