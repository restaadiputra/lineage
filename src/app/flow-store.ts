import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Diagnostic } from '../model/parse'
import { analyze, type ValidFlow } from './analyze'
import { appendIgnore } from './append-ignore'
import type { KeyValueStore } from './ports'
import { loadSettings, saveSettings, type EdgeGroup, type Settings } from './settings'

/** What the user is looking at: a node, optionally narrowed to one of its fields. */
export interface Selection {
  id: string
  /** field path relative to the node, e.g. "[].status" */
  fieldPath?: string
}

/** The file on disk the YAML came from, when there is one. */
export interface OpenFile {
  name: string
  /** text as last read from or written to disk; differs from `yaml` while there are unsaved edits */
  savedText: string
}

export interface FlowState {
  yaml: string
  /** diagnostics of the latest parse, valid or not */
  diagnostics: Diagnostic[]
  /** last valid flow; stays on screen while the YAML has errors */
  valid: ValidFlow | null
  selection: Selection | null
  settings: Settings
  /** bumped by reveal(); the canvas pans to the selection when it changes */
  revealToken: number
  /** bumped when saved positions were replaced from outside the canvas (a layout file) */
  positionsRevision: number
  file: OpenFile | null
  /** newer text found on disk while the editor has unsaved edits */
  diskText: string | null
  /** short confirmation shown in the status bar ("Prompt copied") */
  notice: string | null

  /** Editor typing: text updates now, analysis follows after the debounce. */
  setYaml(text: string): void
  /** Replace the whole document (open file, reload) and analyze immediately. */
  loadYaml(text: string): void
  select(selection: Selection | null): void
  /** Select a node and bring it into view on the canvas. */
  reveal(selection: Selection): void
  /** Accept a rule problem: append it to the file's `ignore:` list. */
  ignoreProblem(entry: { rule: string; node?: string; reason: string }): void
  /** Tell the canvas to read its saved positions again. */
  reloadPositions(): void
  setFile(file: OpenFile | null): void
  setDiskText(text: string | null): void
  notify(notice: string | null): void
  updateSettings(patch: Partial<Settings>): void
  toggleEdgeFilter(group: EdgeGroup): void
}

export interface FlowStoreDeps {
  storage: KeyValueStore
  /** shown on first run, before anything was saved */
  sampleYaml: string
  debounceMs?: number
}

export type FlowStore = StoreApi<FlowState>

const YAML_KEY = 'lineage:yaml'

/** Keep the selection only while the node it points at still exists. */
function keepSelection(selection: Selection | null, valid: ValidFlow | null): Selection | null {
  return selection && valid?.graph.byId.has(selection.id) ? selection : null
}

export function createFlowStore({ storage, sampleYaml, debounceMs = 250 }: FlowStoreDeps): FlowStore {
  const initialYaml = storage.read(YAML_KEY) ?? sampleYaml
  const initial = analyze(initialYaml)
  let pending: ReturnType<typeof setTimeout> | undefined

  return createStore<FlowState>((set, get) => {
    const reanalyze = () => {
      const { diagnostics, valid } = analyze(get().yaml)
      const nextValid = valid ?? get().valid
      set({ diagnostics, valid: nextValid, selection: keepSelection(get().selection, nextValid) })
    }

    const setText = (yaml: string) => {
      set({ yaml })
      storage.write(YAML_KEY, yaml)
      clearTimeout(pending)
    }

    return {
      yaml: initialYaml,
      diagnostics: initial.diagnostics,
      valid: initial.valid,
      selection: null,
      settings: loadSettings(storage),
      revealToken: 0,
      positionsRevision: 0,
      file: null,
      diskText: null,
      notice: null,

      setYaml(text) {
        if (text === get().yaml) return
        setText(text)
        pending = setTimeout(reanalyze, debounceMs)
      },

      loadYaml(text) {
        setText(text)
        reanalyze()
      },

      select(selection) {
        set({ selection: keepSelection(selection, get().valid) })
      },

      reveal(selection) {
        get().select(selection)
        if (get().selection) set({ revealToken: get().revealToken + 1 })
      },

      ignoreProblem(entry) {
        get().loadYaml(appendIgnore(get().yaml, entry))
      },

      reloadPositions: () => set({ positionsRevision: get().positionsRevision + 1 }),
      setFile: (file) => set({ file }),
      setDiskText: (diskText) => set({ diskText }),
      notify: (notice) => set({ notice }),

      updateSettings(patch) {
        const settings = { ...get().settings, ...patch }
        set({ settings })
        saveSettings(storage, settings)
      },

      toggleEdgeFilter(group) {
        const { edgeFilters } = get().settings
        get().updateSettings({ edgeFilters: { ...edgeFilters, [group]: !edgeFilters[group] } })
      },
    }
  })
}
