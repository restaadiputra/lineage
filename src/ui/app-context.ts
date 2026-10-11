import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import type { CodeSession } from '../app/code-session'
import type { CompareSession } from '../app/compare-session'
import type { FileSession } from '../app/file-session'
import type { FlowState, FlowStore } from '../app/flow-store'
import type { LayoutExchange } from '../app/layout-exchange'
import type { Clipboard } from '../app/ports'
import type { PositionRepository } from '../app/position-repository'

/** Services the UI needs. Built once in main.tsx (the composition root). */
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
