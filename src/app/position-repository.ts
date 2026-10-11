import type { KeyValueStore } from './ports'

export interface Point {
  x: number
  y: number
}
export type Positions = Record<string, Point>

/**
 * Canvas positions, keyed by flow name + node id. They are a viewing
 * preference, so they live in browser storage and never in the YAML.
 */
export interface PositionRepository {
  load(flowName: string): Positions
  save(flowName: string, positions: Positions): void
  clear(flowName: string): void
}

const keyFor = (flowName: string) => `lineage:positions:${flowName}`

const isPoint = (value: unknown): value is Point =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite((value as Point).x) &&
  Number.isFinite((value as Point).y)

export function createPositionRepository(storage: KeyValueStore): PositionRepository {
  return {
    load(flowName) {
      try {
        const raw: unknown = JSON.parse(storage.read(keyFor(flowName)) ?? '{}')
        if (typeof raw !== 'object' || raw === null) return {}
        return Object.fromEntries(Object.entries(raw).filter(([, point]) => isPoint(point))) as Positions
      } catch {
        // Corrupt positions only cost a fresh layout.
        return {}
      }
    },
    save(flowName, positions) {
      storage.write(keyFor(flowName), JSON.stringify(positions))
    },
    clear(flowName) {
      storage.remove(keyFor(flowName))
    },
  }
}
