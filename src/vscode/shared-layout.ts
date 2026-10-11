import type { LayoutExchange } from '../app/layout-exchange'
import type { KeyValueStore, TextFile } from '../app/ports'

const appliedKey = (fileName: string) => `lineage:layout-applied:${fileName}`

/**
 * Applies the `.flow.layout.json` found next to the flow file, once per
 * version of that file. A teammate's new arrangement arrives with a pull; your
 * own later moves are not overwritten every time the diagram is opened.
 */
export function applySharedLayout(layout: LayoutExchange, storage: KeyValueStore, shared: TextFile | null): boolean {
  if (!shared || storage.read(appliedKey(shared.name)) === shared.text) return false
  layout.apply(shared)
  storage.write(appliedKey(shared.name), shared.text)
  return true
}
