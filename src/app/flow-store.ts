import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Diagnostic } from '../model/parse'
import { analyze, type ValidFlow } from './analyze'
import { appendIgnore } from './append-ignore'
import { buildComparison, type Comparison } from './comparison'
import { applyEdits, type FlowEdit } from './edit-flow'
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

export const INSPECTOR_TABS = ['details', 'problems', 'compare'] as const
export type InspectorTab = (typeof INSPECTOR_TABS)[number]

/** The dialogs that open over the app. One at a time. */
export type DialogName = 'search' | 'add-node' | 'connect'

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
  /** set while the flow (the plan) is compared with a second flow file (the code) */
  comparison: Comparison | null
  inspectorTab: InspectorTab
  dialog: DialogName | null

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
  /** Compare the flow with the YAML of a second flow file. Reports and does nothing if that file has errors. */
  compareWith(fileName: string, yamlText: string): void
  stopComparing(): void
  setInspectorTab(tab: InspectorTab): void
  /** Open a dialog. Connect needs a selected node and says so when there is none. */
  openDialog(dialog: DialogName): void
  closeDialog(): void
  /**
   * Make a change from the canvas by writing it into the YAML. Nothing is
   * changed, and false is returned, when the result would not be a valid flow.
   */
  applyEdits(edits: FlowEdit[]): boolean
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

/** Keep the selection only while the node it points at still exists (in either flow, while comparing). */
function keepSelection(selection: Selection | null, valid: ValidFlow | null, comparison: Comparison | null): Selection | null {
  const graph = comparison?.merged.graph ?? valid?.graph
  return selection && graph?.byId.has(selection.id) ? selection : null
}

export function createFlowStore({ storage, sampleYaml, debounceMs = 250 }: FlowStoreDeps): FlowStore {
  const initialYaml = storage.read(YAML_KEY) ?? sampleYaml
  const initial = analyze(initialYaml)
  let pending: ReturnType<typeof setTimeout> | undefined

  return createStore<FlowState>((set, get) => {
    const reanalyze = () => {
      const { diagnostics, valid } = analyze(get().yaml)
      const nextValid = valid ?? get().valid
      // The plan changed, so the comparison with the same code has to be redone.
      const previous = get().comparison
      const comparison = previous && nextValid ? buildComparison(nextValid.flow, previous.code, previous.fileName) : null
      set({ diagnostics, valid: nextValid, comparison, selection: keepSelection(get().selection, nextValid, comparison) })
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
      comparison: null,
      inspectorTab: 'details',
      dialog: null,

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
        set({ selection: keepSelection(selection, get().valid, get().comparison) })
      },

      reveal(selection) {
        get().select(selection)
        if (get().selection) set({ revealToken: get().revealToken + 1 })
      },

      ignoreProblem(entry) {
        get().loadYaml(appendIgnore(get().yaml, entry))
      },

      reloadPositions: () => set({ positionsRevision: get().positionsRevision + 1 }),
      compareWith(fileName, yamlText) {
        const plan = get().valid?.flow
        if (!plan) return
        const { valid: code, diagnostics } = analyze(yamlText)
        if (!code) {
          const first = diagnostics.find((d) => d.severity === 'error')?.message ?? 'it is not a valid flow file'
          get().notify(`Could not compare with ${fileName}: ${first}`)
          return
        }
        set({ comparison: buildComparison(plan, code.flow, fileName), inspectorTab: 'compare' })
      },

      stopComparing() {
        const { inspectorTab, selection, valid } = get()
        set({
          comparison: null,
          inspectorTab: inspectorTab === 'compare' ? 'details' : inspectorTab,
          // A node that only the code had cannot stay selected.
          selection: keepSelection(selection, valid, null),
        })
      },

      setInspectorTab: (inspectorTab) => set({ inspectorTab }),

      openDialog(dialog) {
        if (dialog === 'connect' && !get().selection) {
          get().notify('Select a node first, then connect it.')
          return
        }
        set({ dialog })
      },

      closeDialog: () => set({ dialog: null }),

      applyEdits(edits) {
        const refuse = (why: string) => {
          get().notify(why)
          return false
        }
        if (get().comparison) return refuse('Stop comparing before editing on the canvas.')
        if (get().diagnostics.some((d) => d.severity === 'error')) return refuse('Fix the errors in the YAML before editing on the canvas.')

        let next: string
        try {
          next = applyEdits(get().yaml, edits)
        } catch (error) {
          return refuse(`Could not make that change: ${error instanceof Error ? error.message : String(error)}`)
        }
        // Check before committing: a change made by a click must never leave the file broken.
        const problem = analyze(next).diagnostics.find((d) => d.severity === 'error')
        if (problem) return refuse(`Could not make that change: ${problem.message}`)
        get().loadYaml(next)
        return true
      },
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
