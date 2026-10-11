import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../adapters/memory-storage'
import sample from '../samples/orders.flow.yaml?raw'
import { fakeDisk } from '../testing/fake-disk'
import { createFileSession } from './file-session'
import { createFlowStore } from './flow-store'
import { codeToDiagramPrompt, diagramToCodePrompt } from './prompts'
import { searchNodes } from './search'

const flow = (name: string) => `version: 1\nname: ${name}\n`

function setup(diskText = flow('On disk')) {
  const store = createFlowStore({ storage: createMemoryStorage(), sampleYaml: sample })
  const fake = fakeDisk(diskText)
  return { store, ...fake, session: createFileSession({ store, files: fake.files }) }
}

describe('file session', () => {
  it('opens a file into the editor', async () => {
    const { store, session } = setup()
    await session.open()
    expect(store.getState().valid?.flow.name).toBe('On disk')
    expect(store.getState().file).toEqual({ name: 'orders.flow.yaml', savedText: flow('On disk') })
  })

  it('does nothing when the picker is cancelled', async () => {
    const { store, session, disk } = setup()
    disk.cancelled = true
    await session.open()
    expect(store.getState().file).toBeNull()
    expect(store.getState().valid?.flow.name).toBe('Orders dashboard')
  })

  it('reloads when another tool edits the file and the editor is clean', async () => {
    const { store, session, edit } = setup()
    await session.open()
    edit(flow('From Copilot'))
    await session.checkDisk()
    expect(store.getState().valid?.flow.name).toBe('From Copilot')
    expect(store.getState().diskText).toBeNull()
  })

  it('asks instead of overwriting unsaved edits', async () => {
    const { store, session, edit } = setup()
    await session.open()
    store.getState().loadYaml(flow('Mine'))
    edit(flow('Theirs'))
    await session.checkDisk()

    expect(store.getState().valid?.flow.name).toBe('Mine')
    expect(store.getState().diskText).toBe(flow('Theirs'))

    session.reloadFromDisk()
    expect(store.getState().valid?.flow.name).toBe('Theirs')
    expect(store.getState().diskText).toBeNull()
  })

  it('keeps my edits when asked, and they stay unsaved', async () => {
    const { store, session, edit } = setup()
    await session.open()
    store.getState().loadYaml(flow('Mine'))
    edit(flow('Theirs'))
    await session.checkDisk()
    session.keepMine()

    const { yaml, file, diskText } = store.getState()
    expect(diskText).toBeNull()
    expect(yaml).toBe(flow('Mine'))
    expect(file?.savedText).not.toBe(yaml)

    // The same disk version must not raise the question again.
    await session.checkDisk()
    expect(store.getState().diskText).toBeNull()
  })

  it('saves, and does not mistake its own write for an external edit', async () => {
    const { store, session, disk } = setup()
    await session.open()
    store.getState().loadYaml(flow('Mine'))
    await session.save()
    expect(disk.text).toBe(flow('Mine'))
    expect(store.getState().file?.savedText).toBe(flow('Mine'))

    await session.checkDisk()
    expect(store.getState().diskText).toBeNull()
    expect(store.getState().notice).toBe('Saved orders.flow.yaml')
  })

  it('reports a failed save as a notice', async () => {
    const { store, session, files } = setup()
    files.save = async () => {
      throw new Error('disk full')
    }
    await session.save()
    expect(store.getState().notice).toBe('Could not save: disk full')
  })
})

describe('searchNodes', () => {
  const nodes = createFlowStore({ storage: createMemoryStorage(), sampleYaml: sample }).getState().valid!.flow.nodes
  const find = (query: string) => searchNodes(nodes, query).map((n) => n.id)

  it('ranks exact, then prefix, then substring, then scattered letters', () => {
    expect(find('orders').slice(0, 3)).toEqual(['orders', 'OrdersPage', 'ordersQuery'])
    expect(find('row')).toEqual(['OrderRow'])
    expect(find('olst')).toContain('OrderList')
    expect(find('zzz')).toEqual([])
  })

  it('lists the first nodes for an empty query', () => {
    expect(find('  ')).toHaveLength(8)
    expect(find('')[0]).toBe('App')
  })
})

describe('prompts', () => {
  it('embed the format spec, and the diagram when asked for code', () => {
    expect(codeToDiagramPrompt('# FORMAT')).toContain('# FORMAT')
    const prompt = diagramToCodePrompt('# FORMAT', flow('Mine'))
    expect(prompt).toContain('```yaml\nversion: 1\nname: Mine\n```')
    expect(prompt).toContain('# FORMAT')
  })
})
