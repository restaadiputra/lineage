import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import type { CodeSession } from '../app/code-session'
import type { CompareSession } from '../app/compare-session'
import type { FileSession } from '../app/file-session'
import type { FlowState, FlowStore } from '../app/flow-store'
import type { LayoutExchange } from '../app/layout-exchange'
import type { Clipboard } from '../app/ports'
import type { PositionRepository } from '../app/position-repository'

/** What the surrounding application does for Lineage, when it runs inside one. */
export interface HostFeatures {
  /** inside an editor (VS Code) that already opens, saves and themes: Lineage hides its own controls for those */
  embedded: boolean
  /** open a node's `source` ("path/file.tsx:12") in the host's editor */
  openSource?(source: string): void
}

/** Services the UI needs. Built once per entry point by compose.tsx. */
export interface AppServices {
  store: FlowStore
  positions: PositionRepository
  clipboard: Clipboard
  files: FileSession
  layout: LayoutExchange
  compare: CompareSession
  code: CodeSession
  /** docs/FORMAT.md, handed to the user's AI by the Ask AI menu */
  formatDoc: string
  /** the built-in example flow, offered again from the flow menu */
  sampleYaml: string
  host: HostFeatures
}

export const AppContext = createContext<AppServices | null>(null)

export function useServices(): AppServices {
  const services = useContext(AppContext)
  if (!services) throw new Error('AppContext is missing: wrap the tree in <AppContext value={…}>')
  return services
}

/** Subscribe to a slice of the flow store. */
export function useFlow<T>(selector: (state: FlowState) => T): T {
  return useStore(useServices().store, selector)
}
