import type { ReadResult } from '../reader/source-files'
import type { FileSession } from './file-session'
import type { FlowStore } from './flow-store'
import type { CodeReader, FileGateway } from './ports'

export interface CodeSessionDeps {
  store: FlowStore
  files: FileGateway
  reader: CodeReader
  session: FileSession
}

/** Reads a folder of React source without AI, to cross-check a flow or to start one. */
export interface CodeSession {
  /** Pick a folder, read it, and compare the open flow with what the code says. */
  compareWithFolder(): Promise<void>
  /**
   * Pick a folder, read it, and replace the editor with the result.
   * `mayReplace` is asked just before replacing, once it is known there is something to load.
   */
  newFlowFromFolder(mayReplace: () => boolean): Promise<void>
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export function createCodeSession({ store, files, reader, session }: CodeSessionDeps): CodeSession {
  const notify = (text: string) => store.getState().notify(text)

  /** Folder → flow. Null when the user cancelled, the folder had no components, or reading failed. */
  async function readFolder(): Promise<(ReadResult & { folder: string }) | null> {
    try {
      const folder = await files.openFolder()
      if (!folder) return null
      notify(`Reading ${plural(folder.files.length, 'file')} from ${folder.name}…`)
      const result = await reader.read(folder.files, folder.name)
      if (result.componentCount === 0) {
        notify(`No React components were found in ${folder.name}.`)
        return null
      }
      return { ...result, folder: folder.name }
    } catch (error) {
      notify(`Could not read the code: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  const summary = ({ componentCount, notes, folder }: ReadResult & { folder: string }) =>
    `Read ${plural(componentCount, 'component')} from ${folder}` + (notes.length ? `; ${plural(notes.length, 'thing')} could not be followed` : '')

  return {
    async compareWithFolder() {
      const result = await readFolder()
      if (!result) return
      store.getState().compareWith(`${result.folder}/ (read from code)`, result.yaml, result.notes)
      if (store.getState().comparison) notify(summary(result))
    },

    async newFlowFromFolder(mayReplace) {
      const result = await readFolder()
      if (!result || !mayReplace()) return
      session.startNew(result.yaml)
      notify(summary(result))
    },
  }
}
