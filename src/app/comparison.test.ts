import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../adapters/memory-storage'
import { compareFlows, mergeFlows } from '../analysis/compare'
import { edgeDiffView, nodeDiffStatus } from '../canvas/diff-view'
import { buildViewEdges } from '../canvas/view-edges'
import { buildGraph } from '../model/graph'
import { CODE_YAML, PLAN_YAML } from '../testing/compare-fixtures'
import { fakeDisk } from '../testing/fake-disk'
import { analyze } from './analyze'
import { createCompareSession } from './compare-session'
import { differenceCount } from './comparison'
import { createFlowStore } from './flow-store'

function setup() {
  const storage = createMemoryStorage({ 'lineage:yaml': PLAN_YAML })
  const store = createFlowStore({ storage, sampleYaml: PLAN_YAML })
  return { store, state: () => store.getState() }
}

describe('comparing in the store', () => {
  it('starts a comparison and opens the Compare tab', () => {
    const { state } = setup()
    state().compareWith('cart.code.flow.yaml', CODE_YAML)

    const { comparison, inspectorTab } = state()
    expect(comparison?.fileName).toBe('cart.code.flow.yaml')
    expect(differenceCount(comparison!.diff)).toBeGreaterThan(0)
    expect(comparison?.merged.graph.byId.has('Total')).toBe(true)
    expect(inspectorTab).toBe('compare')
  })

  it('refuses a code file with errors and says why', () => {
    const { state } = setup()
    state().compareWith('broken.flow.yaml', 'version: 1\nnodes:\n  - { id: A, kind: nonsense }\n')
    expect(state().comparison).toBeNull()
    expect(state().notice).toMatch(/^Could not compare with broken\.flow\.yaml: /)
    expect(state().inspectorTab).toBe('details')
  })

  it('lets a node that only the code has be selected, until the comparison ends', () => {
    const { state } = setup()
    state().select({ id: 'Total' })
    expect(state().selection).toBeNull()

    state().compareWith('code.flow.yaml', CODE_YAML)
    state().select({ id: 'Total' })
    expect(state().selection).toEqual({ id: 'Total' })

    state().stopComparing()
    expect(state().comparison).toBeNull()
    expect(state().selection).toBeNull()
    expect(state().inspectorTab).toBe('details')
  })

  it('keeps a selection that exists in the plan when the comparison ends', () => {
    const { state } = setup()
    state().compareWith('code.flow.yaml', CODE_YAML)
    state().select({ id: 'cart' })
    state().setInspectorTab('problems')
    state().stopComparing()
    expect(state().selection).toEqual({ id: 'cart' })
    expect(state().inspectorTab).toBe('problems')
  })

  it('redoes the comparison when the plan is edited', () => {
    const { state } = setup()
    state().compareWith('code.flow.yaml', CODE_YAML)
    const before = differenceCount(state().comparison!.diff)

    // Make the plan agree with the code about who owns the cart.
    state().loadYaml(PLAN_YAML.replace('owner: CartPage, type: Cart', 'owner: App, type: Cart'))
    expect(differenceCount(state().comparison!.diff)).toBe(before - 1)
    expect(state().comparison?.fileName).toBe('code.flow.yaml')
  })

  it('reports no differences when the code matches the plan', () => {
    const { state } = setup()
    state().compareWith('same.flow.yaml', PLAN_YAML)
    expect(differenceCount(state().comparison!.diff)).toBe(0)
  })
})

describe('compare session', () => {
  it('asks for the code file and compares with it', async () => {
    const { store, state } = setup()
    const { files, disk } = fakeDisk('')
    disk.other = { name: 'cart.code.flow.yaml', text: CODE_YAML }
    await createCompareSession({ store, files }).pickCode()
    expect(state().comparison?.fileName).toBe('cart.code.flow.yaml')
  })

  it('does nothing when the picker is cancelled', async () => {
    const { store, state } = setup()
    const { files, disk } = fakeDisk('')
    disk.cancelled = true
    await createCompareSession({ store, files }).pickCode()
    expect(state().comparison).toBeNull()
  })
})

describe('differences on the canvas', () => {
  const plan = analyze(PLAN_YAML).valid!.flow
  const code = analyze(CODE_YAML).valid!.flow
  const diff = compareFlows(plan, code)
  const viewEdges = buildViewEdges(buildGraph(mergeFlows(plan, code)))
  const view = (id: string) => edgeDiffView(viewEdges.find((e) => e.id === id)!, diff)

  it('gives every node its status', () => {
    expect(nodeDiffStatus(diff, 'App')).toBe('same')
    expect(nodeDiffStatus(diff, 'Planned')).toBe('plan-only')
    expect(nodeDiffStatus(diff, 'Total')).toBe('code-only')
    expect(nodeDiffStatus(diff, 'cart')).toBe('changed')
  })

  it('draws a render link that only one side has', () => {
    expect(view('tree:CartPage>Total')).toEqual({ status: 'code-only' })
    expect(view('tree:App>CartPage')).toEqual({ status: 'same' })
  })

  it('names the props that differ on a parent to child line', () => {
    // title gained `stable: false` in the code; onSearch exists only there.
    expect(view('tree:App>Header')).toEqual({ status: 'changed', label: '~title +onSearch' })
  })

  it('marks reads, writes and effect edges', () => {
    expect(view('reads:cart>CartList').status).toBe('changed')
    expect(view('writes:CartList>cart').status).toBe('plan-only')
    expect(view('mutates:CartList>cart').status).toBe('code-only')
    expect(view('writes:sync>cart').status).toBe('code-only')
    expect(view('reads:cart>sync').status).toBe('same')
  })

  it('marks an ownership line when the owner differs', () => {
    // The plan's version is drawn (CartPage owns cart); the code says App does.
    expect(view('ownership:CartPage>cart').status).toBe('changed')
    expect(view('ownership:CartPage>sync').status).toBe('same')
  })
})
