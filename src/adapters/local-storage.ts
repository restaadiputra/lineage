import type { KeyValueStore } from '../app/ports'

/**
 * localStorage behind the KeyValueStore port. Storage can be unavailable
 * (private mode, quota, blocked site data), and losing a preference must never
 * break the app, so every call fails quietly.
 */
export function createLocalStorage(): KeyValueStore {
  return {
    read(key) {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, value)
      } catch {
        // Nothing useful to do: the app keeps working from memory.
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key)
      } catch {
        // Same as write.
      }
    },
  }
}
