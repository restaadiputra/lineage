import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../adapters/memory-storage'
import { createFlowStore } from '../app/flow-store'
import { createLayoutExchange } from '../app/layout-exchange'
import { createPositionRepository } from '../app/position-repository'
import sample from '../samples/orders.flow.yaml?raw'
import { fakeDisk } from '../testing/fake-disk'
import { createHostClipboard, createHostFiles, createHostStorage } from './host-adapters'
import { createHostBridge } from './host-bridge'
import type { ToHost, ToWebview } from './protocol'
import { applySharedLayout } from './shared-layout'
import { connectDocument, hostProblems } from './sync'

const flow = (name: string) => `version: 1\nname: ${name}\n`

/** A stand-in for VS Code: records what the webview posts and can send messages to it. */
function fakeHost() {
  const posted: ToHost[] = []
  let deliver: (event: { data: unknown }) => void = () => {}
  const bridge = createHostBridge(
    { postMessage: (message) => void posted.push(message as ToHost) },
    { addEventListener: (_type, listener) => void (deliver = listener) },
  )
  const send = (message: ToWebview) => deliver({ data: message })
  const ofType = <T extends ToHost['type']>(type: T) => posted.filter((m): m is Extract<ToHost, { type: T }> => m.type === type)
  return { bridge, posted, send, ofType }
}

describe('host bridge', () => {
  it('delivers host messages to subscribers until they unsubscribe', () => {
    const { bridge, send } = fakeHost()
    const seen: string[] = []
    const stop = bridge.subscribe((message) => seen.push(message.type))
    send({ type: 'document', text: 'a' })
    stop()
    send({ type: 'document', text: 'b' })
    expect(seen).toEqual(['document'])
  })

  it('matches each answer to its request', async () => {
    const { bridge, send, ofType } = fakeHost()
    const first = bridge.request({ kind: 'openFolder' })
    const second = bridge.request({ kind: 'openText', fileType: { description: 'Layout', mime: 'application/json', extensions: ['.json'] } })
    const [a, b] = ofType('request')
    expect([a.request.kind, b.request.kind]).toEqual(['openFolder', 'openText'])

    // Answered out of order.
    send({ type: 'response', id: b.id, result: { name: 'x.json', text: '{}' } })
    send({ type: 'response', id: a.id, result: null })
    expect(await second).toEqual({ name: 'x.json', text: '{}' })
    expect(await first).toBeNull()
  })

  it('turns a host error into a rejection', async () => {
    const { bridge, send, ofType } = fakeHost()
    const request = bridge.request({ kind: 'openFolder' })
    send({ type: 'response', id: ofType('request')[0].id, error: 'no permission' })
    await expect(request).rejects.toThrow('no permission')
  })
})

describe('host adapters', () => {
  it('reads storage synchronously from the snapshot and mirrors writes to the host', () => {
    const { bridge, ofType } = fakeHost()
    const storage = createHostStorage(bridge, { 'lineage:settings': '{"theme":"dark"}' }, flow('Doc'))
    expect(storage.read('lineage:settings')).toBe('{"theme":"dark"}')
    expect(storage.read('lineage:yaml')).toBe(flow('Doc'))

    storage.write('lineage:positions:Doc', '{}')
    storage.remove('lineage:settings')
    expect(storage.read('lineage:settings')).toBeNull()
    expect(ofType('store')).toEqual([
      { type: 'store', key: 'lineage:positions:Doc', value: '{}' },
      { type: 'store', key: 'lineage:settings', value: null },
    ])
  })

  it('never stores the document text: that belongs to VS Code', () => {
    const { bridge, ofType } = fakeHost()
    const storage = createHostStorage(bridge, {}, flow('Doc'))
    storage.write('lineage:yaml', flow('Edited'))
    expect(storage.read('lineage:yaml')).toBe(flow('Edited'))
    expect(ofType('store')).toEqual([])
  })

  it('hands the document over once, then has nothing to open', async () => {
    const { bridge } = fakeHost()
    const files = createHostFiles(bridge, { fileName: 'orders.flow.yaml', text: flow('Doc') })
    expect(await files.open()).toMatchObject({ ref: { name: 'orders.flow.yaml' }, text: flow('Doc') })
    expect(await files.open()).toBeNull()
    expect(await files.lastModified({ name: 'orders.flow.yaml', handle: null })).toBeNull()
  })

  it('asks VS Code to save, to show dialogs and to copy', async () => {
    const { bridge, posted, send, ofType } = fakeHost()
    const files = createHostFiles(bridge, { fileName: 'orders.flow.yaml', text: '' })
    await files.save(null, 'text', 'orders.flow.yaml')
    await createHostClipboard(bridge).copy('hello')
    expect(posted).toEqual([{ type: 'save' }, { type: 'copy', text: 'hello' }])

    const saving = files.saveText({ name: 'a.layout.json', text: '{}' }, { description: 'Layout', mime: 'application/json', extensions: ['.json'] })
    const [request] = ofType('request')
    expect(request.request).toMatchObject({ kind: 'saveText', file: { name: 'a.layout.json' } })
    send({ type: 'response', id: request.id, result: true })
    expect(await saving).toBe(true)
  })
})

describe('document sync', () => {
  function setup(text = flow('Doc')) {
    const host = fakeHost()
    const store = createFlowStore({ storage: createMemoryStorage({ 'lineage:yaml': text }), sampleYaml: sample })
    const stop = connectDocument(store, host.bridge, text)
    return { ...host, store, stop }
  }

  it('sends an edit when the YAML changes in the webview', () => {
    const { store, ofType } = setup()
    store.getState().loadYaml(flow('Edited'))
    expect(ofType('edit')).toEqual([{ type: 'edit', text: flow('Edited') }])
  })

  it('takes a change from VS Code without sending it back', () => {
    const { store, send, ofType } = setup()
    send({ type: 'document', text: flow('From Copilot') })
    expect(store.getState().valid?.flow.name).toBe('From Copilot')
    expect(ofType('edit')).toEqual([])
  })

  it('ignores the echo of its own edit', () => {
    const { store, send, ofType } = setup()
    store.getState().loadYaml(flow('Mine'))
    send({ type: 'document', text: flow('Mine') })
    expect(ofType('edit')).toHaveLength(1)
    expect(store.getState().yaml).toBe(flow('Mine'))
  })

  it('reports the status at once, and again only when it changes', () => {
    const { store, ofType } = setup(sample)
    expect(ofType('status')).toHaveLength(1)
    expect(ofType('status')[0].nodeCount).toBe(21)

    store.getState().select({ id: 'orders' })
    expect(ofType('status')).toHaveLength(1)

    store.getState().loadYaml(flow('Small'))
    expect(ofType('status').at(-1)).toEqual({ type: 'status', nodeCount: 0, problems: [] })
  })

  it('stops when disconnected', () => {
    const { store, stop, ofType } = setup()
    stop()
    store.getState().loadYaml(flow('Later'))
    expect(ofType('edit')).toEqual([])
  })
})

describe('hostProblems', () => {
  const stateFor = (text: string) => createFlowStore({ storage: createMemoryStorage({ 'lineage:yaml': text }), sampleYaml: sample }).getState()

  it('pins each rule problem to the line of its node, with the fix', () => {
    const problems = hostProblems(stateFor(sample))
    const mutation = problems.find((p) => p.code === 'mutation')
    expect(mutation).toMatchObject({ severity: 'error', line: sample.split('\n').findIndex((l) => l === '  - id: QtyStepper') + 1 })
    expect(mutation?.message).toContain('QtyStepper mutates orders')
    expect(mutation?.message).toContain('Pass a callback')
    // Problems the file chose to ignore are not reported.
    expect(problems.some((p) => p.code === 'list-key')).toBe(false)
  })

  it('reports only file errors while the YAML is broken', () => {
    const store = createFlowStore({ storage: createMemoryStorage({ 'lineage:yaml': sample }), sampleYaml: sample })
    store.getState().loadYaml('version: 1\nnodes:\n  - id: App\n    kind: nonsense\n')
    const problems = hostProblems(store.getState())
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.every((p) => p.severity === 'error' && p.code === undefined)).toBe(true)
    expect(problems[0].line).toBe(4)
  })
})

describe('shared layout', () => {
  function setup() {
    const storage = createMemoryStorage()
    const store = createFlowStore({ storage, sampleYaml: sample })
    const positions = createPositionRepository(storage)
    const layout = createLayoutExchange({ store, positions, files: fakeDisk('').files })
    return { storage, store, positions, layout }
  }
  const file = (x: number) => ({ name: 'orders.flow.layout.json', text: JSON.stringify({ version: 1, flow: 'Orders dashboard', positions: { App: { x, y: 0 } } }) })

  it('applies the layout file found next to the flow', () => {
    const { layout, storage, positions } = setup()
    expect(applySharedLayout(layout, storage, file(500))).toBe(true)
    expect(positions.load('Orders dashboard').App).toEqual({ x: 500, y: 0 })
  })

  it('does not re-apply the same file over later moves, but does apply a new version', () => {
    const { layout, storage, positions } = setup()
    applySharedLayout(layout, storage, file(500))
    positions.save('Orders dashboard', { App: { x: 7, y: 7 } })

    expect(applySharedLayout(layout, storage, file(500))).toBe(false)
    expect(positions.load('Orders dashboard').App).toEqual({ x: 7, y: 7 })

    expect(applySharedLayout(layout, storage, file(900))).toBe(true)
    expect(positions.load('Orders dashboard').App).toEqual({ x: 900, y: 0 })
  })

  it('does nothing when there is no layout file', () => {
    const { layout, storage } = setup()
    expect(applySharedLayout(layout, storage, null)).toBe(false)
  })
})
