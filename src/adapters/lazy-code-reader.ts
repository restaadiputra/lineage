import type { CodeReader } from '../app/ports'

/**
 * The code reader, loaded on first use. It brings the TypeScript compiler
 * with it (several megabytes), which most sessions never need.
 */
export function createLazyCodeReader(): CodeReader {
  return {
    async read(files, flowName) {
      const { readCode } = await import('../reader/read-code')
      return readCode(files, flowName)
    },
  }
}
