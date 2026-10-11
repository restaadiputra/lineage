import type { FlowState } from './flow-store'

/** What "New flow" starts from: valid, empty, and showing the top-level keys. */
export const NEW_FLOW_YAML = ['version: 1', 'name: Untitled flow', '', 'types: {}', 'nodes: []', 'edges: []', ''].join('\n')

/**
 * Whether replacing the editor's text would lose something. With a file open
 * that means unsaved edits; without one, anything the user wrote themselves
 * (`disposable` lists texts that can always be recreated: the sample, a new flow).
 */
export function hasUnsavedWork({ yaml, file }: Pick<FlowState, 'yaml' | 'file'>, disposable: string[]): boolean {
  if (file) return file.savedText !== yaml
  return !disposable.includes(yaml)
}
