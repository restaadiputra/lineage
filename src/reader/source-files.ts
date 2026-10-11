/**
 * What goes into and comes out of the code reader. Kept apart from the reader
 * itself so the rest of the app can use these without loading the TypeScript
 * compiler, which is large and only fetched when code is actually read.
 */

export interface SourceInput {
  /** path relative to the folder that was read, with forward slashes */
  path: string
  text: string
}

export interface ReadResult {
  yaml: string
  /** things the reader saw but could not follow */
  notes: string[]
  componentCount: number
}

const SOURCE = /\.(tsx?|jsx?)$/
const SKIPPED = /(^|\/)(node_modules|dist|build|coverage|\.[^/]+)\/|\.d\.ts$|\.(test|spec|stories)\.[jt]sx?$/

/** Whether a file is application source the reader should look at. */
export const isReadable = (path: string) => SOURCE.test(path) && !SKIPPED.test(path)
