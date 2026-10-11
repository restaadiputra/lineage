import type { KeyValueStore } from '../app/ports'

/** In-memory KeyValueStore, used by tests. */
export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial))
  return {
    read: (key) => data.get(key) ?? null,
    write: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  }
}
