import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../adapters/memory-storage'
import { readCode } from '../reader/read-code'
import type { SourceInput } from '../reader/source-files'
import sample from '../samples/orders.flow.yaml?raw'
import { fakeDisk } from '../testing/fake-disk'
import { createCodeSession } from './code-session'
import { createFileSession } from './file-session'
import { createFlowStore } from './flow-store'
import type { CodeReader } from './ports'

const fixture = import.meta.glob('../../fixtures/orders-app/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const files: SourceInput[] = Object.entries(fixture).map(([path, text]) => ({ path: path.replace('../../fixtures/orders-app/', ''), text }))

function setup(reader: CodeReader = { read: async (inputs, name) => readCode(inputs, name) }) {
  const store = createFlowStore({ storage: createMemoryStorage(), sampleYaml: sample })
  const fake = fakeDisk('')
  fake.disk.folder = { name: 'orders-app', files }
  const session = createFileSession({ store, files: fake.files })
  const code = createCodeSession({ store, files: fake.files, reader, session })
  return { store, code, state: () => store.getState(), ...fake }
}

describe('code session', () => {
  it('compares the open flow with what the code says, and keeps the reader notes', async () => {
    const { code, state } = setup()
    await code.compareWithFolder()

    const { comparison, notice, inspectorTab } = state()
    expect(comparison?.fileName).toBe('orders-app/ (read from code)')
    expect(comparison?.notes).toEqual(['App calls useCart(), a hook the reader does not follow; anything it holds is missing.'])
    expect(inspectorTab).toBe('compare')
    expect(notice).toBe('Read 12 components from orders-app; 1 thing could not be followed')
  })

  it('finds where the sample and the code disagree', async () => {
    const { code, state } = setup()
    await code.compareWithFolder()
    const { diff } = state().comparison!
    const status = (key: string) => diff.byKey.get(key)?.status

    // The code names its effect after what it sets; the sample calls it computeTotal.
    expect(status('computeTotal')).toBe('plan-only')
    expect(status('syncTotal')).toBe('code-only')
    // Things both describe the same way.
    for (const key of ['orders', 'OrderList', 'tree:OrderList>OrderRow', 'mutates:QtyStepper>orders', 'prop:OrderList>OrderRow:order'])
      expect(status(key), key).toBe('same')
    // The code passes a search callback the sample never mentions.
    expect(status('prop:App>Header:onSearch')).toBe('code-only')
  })

  it('starts a new flow from the code', async () => {
    const { code, state } = setup()
    await code.newFlowFromFolder(() => true)

    expect(state().valid?.flow.name).toBe('orders-app')
    expect(state().valid?.flow.nodes).toHaveLength(21)
    expect(state().file).toBeNull()
    expect(state().yaml).toMatch(/^# Read from source code by Lineage, without AI\./)
  })

  it('reads first and asks second, and keeps the flow when the answer is no', async () => {
    const { code, state } = setup()
    const before = state().yaml
    let asked = 0
    await code.newFlowFromFolder(() => {
      asked += 1
      return false
    })
    expect(asked).toBe(1)
    expect(state().yaml).toBe(before)
  })

  it('does nothing when the folder picker is cancelled', async () => {
    const { code, state, disk } = setup()
    disk.cancelled = true
    await code.compareWithFolder()
    expect(state().comparison).toBeNull()
    expect(state().notice).toBeNull()
  })

  it('says so when the folder has no components, without asking to replace anything', async () => {
    const { code, state, disk } = setup()
    disk.folder = { name: 'utils', files: [{ path: 'add.ts', text: 'export const add = (a: number, b: number) => a + b' }] }
    let asked = false
    await code.newFlowFromFolder(() => (asked = true))

    expect(state().notice).toBe('No React components were found in utils.')
    expect(asked).toBe(false)
    await code.compareWithFolder()
    expect(state().comparison).toBeNull()
  })

  it('reports a reader failure instead of throwing', async () => {
    const { code, state } = setup({
      read: async () => {
        throw new Error('out of memory')
      },
    })
    await code.compareWithFolder()
    expect(state().notice).toBe('Could not read the code: out of memory')
  })
})
