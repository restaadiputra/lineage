import { layoutFileName } from './file-names'
import type { FlowStore } from './flow-store'
import { LAYOUT_FILE_TYPE, parseLayout, serializeLayout } from './layout-file'
import type { FileGateway, TextFile } from './ports'
import type { PositionRepository, Positions } from './position-repository'

export interface LayoutExchangeDeps {
  store: FlowStore
  positions: PositionRepository
  files: FileGateway
}

/** Moves canvas positions between the browser and a `.flow.layout.json` file. */
export interface LayoutExchange {
  /** Save the current arrangement to a file. */
  exportLayout(): Promise<void>
  /** Ask for a layout file and apply it. */
  importLayout(): Promise<void>
  /** Apply the text of a layout file (also used for a file dropped on the window). */
  apply(file: TextFile): void
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function createLayoutExchange({ store, positions, files }: LayoutExchangeDeps): LayoutExchange {
  const state = () => store.getState()

  const apply = ({ name, text }: TextFile) => {
    const flow = state().valid?.flow
    if (!flow) return
    const parsed = parseLayout(text)
    if (!parsed.ok) {
      state().notify(`Could not read ${name}: ${parsed.error}`)
      return
    }

    const ids = flow.nodes.map((n) => n.id)
    const known: Positions = Object.fromEntries(
      ids.filter((id) => parsed.layout.positions[id]).map((id) => [id, parsed.layout.positions[id]]),
    )
    const count = Object.keys(known).length
    if (count === 0) {
      state().notify(`${name} has no positions for the nodes in this flow`)
      return
    }

    // Nodes the file does not mention keep where they are.
    positions.save(flow.name, { ...positions.load(flow.name), ...known })
    state().reloadPositions()
    const origin = parsed.layout.flow === flow.name ? '' : `, saved for “${parsed.layout.flow}”`
    state().notify(`Layout applied to ${count} of ${ids.length} nodes${origin}`)
  }

  return {
    apply,

    async exportLayout() {
      const { valid, file } = state()
      if (!valid) return
      const { flow } = valid
      const name = layoutFileName(file?.name, flow.name)
      const text = serializeLayout(flow.name, positions.load(flow.name), flow.nodes.map((n) => n.id))
      try {
        if (await files.saveText({ name, text }, LAYOUT_FILE_TYPE)) state().notify(`Layout saved as ${name}`)
      } catch (error) {
        state().notify(`Could not save the layout: ${reasonOf(error)}`)
      }
    },

    async importLayout() {
      try {
        const picked = await files.openText(LAYOUT_FILE_TYPE)
        if (picked) apply(picked)
      } catch (error) {
        state().notify(`Could not open the layout: ${reasonOf(error)}`)
      }
    },
  }
}
