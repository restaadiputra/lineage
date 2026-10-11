import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../adapters/memory-storage'
import sample from '../samples/orders.flow.yaml?raw'
import { fakeDisk } from '../testing/fake-disk'
import { flowFileName, isLayoutFileName, layoutFileName } from './file-names'
import { createFileSession } from './file-session'
import { createFlowStore } from './flow-store'
import { createLayoutExchange } from './layout-exchange'
import { parseLayout, serializeLayout } from './layout-file'
import { createPositionRepository } from './position-repository'

const FLOW = 'Orders dashboard'

function setup() {
  const storage = createMemoryStorage()
  const store = createFlowStore({ storage, sampleYaml: sample })
  const positions = createPositionRepository(storage)
  const fake = fakeDisk('version: 1\nname: On disk\n')
  const layout = createLayoutExchange({ store, positions, files: fake.files })
  return { store, positions, layout, ...fake }
}

const layoutJson = (flow: string, positions: Record<string, { x: number; y: number }>) =>
  JSON.stringify({ version: 1, flow, positions })

describe('file names', () => {
  it('names a never-saved flow after the flow', () => {
    expect(flowFileName('Orders dashboard')).toBe('orders-dashboard.flow.yaml')
    expect(flowFileName('  ')).toBe('untitled.flow.yaml')
  })

  it('puts the layout file next to the flow file', () => {
    expect(layoutFileName('orders.flow.yaml', FLOW)).toBe('orders.flow.layout.json')
    expect(layoutFileName('orders.yml', FLOW)).toBe('orders.layout.json')
    expect(layoutFileName(undefined, FLOW)).toBe('orders-dashboard.flow.layout.json')
  })

  it('recognises layout files by name', () => {
    expect(isLayoutFileName('orders.flow.layout.json')).toBe(true)
    expect(isLayoutFileName('orders.flow.yaml')).toBe(false)
    expect(isLayoutFileName('package.json')).toBe(false)
  })
})

describe('layout file', () => {
  it('writes existing nodes only, sorted and rounded, so it diffs cleanly', () => {
    const text = serializeLayout(
      FLOW,
      { Header: { x: 10.4, y: 20.6 }, App: { x: 1, y: 2 }, Gone: { x: 9, y: 9 } },
      ['Header', 'App', 'NeverPlaced'],
    )
    expect(text).toBe(
      JSON.stringify({ version: 1, flow: FLOW, positions: { App: { x: 1, y: 2 }, Header: { x: 10, y: 21 } } }, null, 2) + '\n',
    )
  })

  it('round-trips', () => {
    const parsed = parseLayout(serializeLayout(FLOW, { App: { x: 1, y: 2 } }, ['App']))
    expect(parsed).toEqual({ ok: true, layout: { version: 1, flow: FLOW, positions: { App: { x: 1, y: 2 } } } })
  })

  it('explains what is wrong with a bad file', () => {
    expect(parseLayout('{nope')).toEqual({ ok: false, error: 'it is not valid JSON' })
    expect(parseLayout(JSON.stringify({ version: 2, flow: 'x', positions: {} }))).toMatchObject({ ok: false })
    const bad = parseLayout(JSON.stringify({ version: 1, flow: 'x', positions: { App: { x: 'left', y: 0 } } }))
    expect(bad).toMatchObject({ ok: false, error: expect.stringContaining('positions.App.x') })
  })
})

describe('layout exchange', () => {
  it('exports the saved positions under the name that sits next to the flow file', async () => {
    const { layout, positions, disk, store } = setup()
    positions.save(FLOW, { App: { x: 5, y: 6 }, Header: { x: 50.5, y: 60 }, Stale: { x: 0, y: 0 } })
    await layout.exportLayout()

    expect(disk.savedTexts).toHaveLength(1)
    expect(disk.savedTexts[0].name).toBe('orders-dashboard.flow.layout.json')
    expect(JSON.parse(disk.savedTexts[0].text)).toEqual({
      version: 1,
      flow: FLOW,
      positions: { App: { x: 5, y: 6 }, Header: { x: 51, y: 60 } },
    })
    expect(store.getState().notice).toBe('Layout saved as orders-dashboard.flow.layout.json')
  })

  it('says nothing when the save dialog is cancelled', async () => {
    const { layout, disk, store } = setup()
    disk.cancelled = true
    await layout.exportLayout()
    expect(disk.savedTexts).toEqual([])
    expect(store.getState().notice).toBeNull()
  })

  it('imports positions for the nodes it knows and keeps the rest', async () => {
    const { layout, positions, disk, store } = setup()
    positions.save(FLOW, { App: { x: 1, y: 1 }, Header: { x: 2, y: 2 } })
    disk.other = { name: 'team.flow.layout.json', text: layoutJson(FLOW, { App: { x: 300, y: 40 }, Removed: { x: 9, y: 9 } }) }

    await layout.importLayout()

    expect(positions.load(FLOW)).toEqual({ App: { x: 300, y: 40 }, Header: { x: 2, y: 2 } })
    expect(store.getState().positionsRevision).toBe(1)
    expect(store.getState().notice).toBe('Layout applied to 1 of 21 nodes')
  })

  it('mentions when the layout was saved for a differently named flow', () => {
    const { layout, store } = setup()
    layout.apply({ name: 'old.layout.json', text: layoutJson('Orders v1', { App: { x: 0, y: 0 } }) })
    expect(store.getState().notice).toBe('Layout applied to 1 of 21 nodes, saved for “Orders v1”')
  })

  it('leaves positions alone when the file is broken or matches nothing', () => {
    const { layout, positions, store } = setup()
    positions.save(FLOW, { App: { x: 1, y: 1 } })

    layout.apply({ name: 'broken.layout.json', text: '{nope' })
    expect(store.getState().notice).toBe('Could not read broken.layout.json: it is not valid JSON')

    layout.apply({ name: 'other.layout.json', text: layoutJson('Other', { Nobody: { x: 0, y: 0 } }) })
    expect(store.getState().notice).toBe('other.layout.json has no positions for the nodes in this flow')

    expect(positions.load(FLOW)).toEqual({ App: { x: 1, y: 1 } })
    expect(store.getState().positionsRevision).toBe(0)
  })
})

describe('dropping a layout file', () => {
  it('lets the layout feature claim it instead of opening it as a flow', async () => {
    const { store, files } = setup()
    const claimed: string[] = []
    const session = createFileSession({
      store,
      files: { ...files, fromDrop: async () => ({ ref: { name: 'a.flow.layout.json', handle: null }, text: '{}', lastModified: 1 }) },
      claimDrop: (file) => {
        claimed.push(file.ref.name)
        return true
      },
    })
    await session.openDropped({} as DataTransfer)

    expect(claimed).toEqual(['a.flow.layout.json'])
    expect(store.getState().file).toBeNull()
    expect(store.getState().valid?.flow.name).toBe(FLOW)
  })
})
