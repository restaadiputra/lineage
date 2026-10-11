import type { IgnoreEntry } from '../model/schema'
import { appendToTopLevelList } from './yaml-list'

/**
 * Adds an entry to the flow file's `ignore:` list and returns the new text.
 * The rest of the file is left exactly as written (see yaml-list.ts).
 */
export function appendIgnore(yamlText: string, { rule, node, reason }: IgnoreEntry): string {
  // Key order matches how FORMAT.md writes ignore entries.
  return appendToTopLevelList(yamlText, 'ignore', node ? { rule, node, reason } : { rule, reason })
}
