import { FLOW_FILE_TYPE } from './file-names'
import type { FlowStore } from './flow-store'
import type { FileGateway } from './ports'

/** Starts a plan-versus-code comparison from a second flow file. */
export interface CompareSession {
  /** Ask for the flow file that describes the code and compare the open flow with it. */
  pickCode(): Promise<void>
}

export function createCompareSession({ store, files }: { store: FlowStore; files: FileGateway }): CompareSession {
  return {
    async pickCode() {
      try {
        const picked = await files.openText(FLOW_FILE_TYPE)
        if (picked) store.getState().compareWith(picked.name, picked.text)
      } catch (error) {
        store.getState().notify(`Could not open the file: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  }
}
