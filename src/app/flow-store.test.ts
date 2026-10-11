import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage } from '../adapters/memory-storage'
import sample from '../samples/orders.flow.yaml?raw'
import { createFlowStore } from './flow-store'

const BROKEN = 'version: 1\nnodes:\n  - id: App\n    kind: nonsense\n'

describe('flow store', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('loads the sample on first run and analyzes it', () => {
    const store = createFlowStore({ storage: createMemoryStorage(), sampleYaml: sample })
    const { valid, diagnostics } = store.getState()
    expect(valid?.flow.name).toBe('Orders dashboard')
    expect(valid?.problems.active.length).toBeGreaterThan(0)
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('prefers the YAML saved from the last session', () => {
    const storage = createMemoryStorage({ 'lineage:yaml': 'version: 1\nname: Saved\n' })
    const store = createFlowStore({ storage, sampleYaml: sample })
    expect(store.getState().valid?.flow.name).toBe('Saved')
  })

  it('updates the text at once, persists it, and re-parses after the debounce', () => {
    const storage = createMemoryStorage()
    const store = createFlowStore({ storage, sampleYaml: sample })
    store.getState().setYaml('version: 1\nname: Edited\n')

    expect(store.getState().yaml).toContain('Edited')
    expect(storage.read('lineage:yaml')).toContain('Edited')
    expect(store.getState().valid?.flow.name).toBe('Orders dashboard')

    vi.advanceTimersByTime(250)
    expect(store.getState().valid?.flow.name).toBe('Edited')
  })

  it('keeps the last valid graph while the YAML has errors', () => {
    const store = createFlowStore({ storage: createMemoryStorage(), sampleYaml: sample })
    store.getState().setYaml(BROKEN)
    vi.advanceTimersByTime(250)

    const { valid, diagnostics } = store.getState()
    expect(valid?.flow.name).toBe('Orders dashboard')
    expect(diagnostics.some((d) => d.severity === 'error')).toBe(true)
  })

  it('drops a selection whose node no longer exists', () => {
    const store = createFlowStore({ storage: createMemoryStorage(), sampleYaml: sample })
    store.getState().select({ id: 'orders', fieldPath: '[].status' })
    expect(store.getState().selection).toEqual({ id: 'orders', fieldPath: '[].status' })

    store.getState().select({ id: 'missing' })
    expect(store.getState().selection).toBeNull()

    store.getState().select({ id: 'orders' })
    store.getState().loadYaml('version: 1\nname: Empty\n')
    expect(store.getState().selection).toBeNull()
  })

  it('persists settings and restores them', () => {
    const storage = createMemoryStorage()
    const store = createFlowStore({ storage, sampleYaml: sample })
    store.getState().updateSettings({ theme: 'dark', editorWidth: 420 })
    store.getState().toggleEdgeFilter('reads')

    const { settings } = createFlowStore({ storage, sampleYaml: sample }).getState()
    expect(settings.theme).toBe('dark')
    expect(settings.editorWidth).toBe(420)
    expect(settings.edgeFilters).toEqual({ tree: true, reads: false, writes: true, ownership: true })
  })

  it('falls back to default settings when the saved ones are corrupt', () => {
    const storage = createMemoryStorage({ 'lineage:settings': '{not json' })
    const { settings } = createFlowStore({ storage, sampleYaml: sample }).getState()
    expect(settings.theme).toBe('system')
    expect(settings.editorOpen).toBe(true)
  })
})
