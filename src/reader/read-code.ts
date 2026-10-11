import { Project, ts } from 'ts-morph'
import { readEffects, readMutations, readWrites } from './calls'
import { collect } from './collect'
import { assemble, toYaml } from './emit'
import { readHooks } from './hooks'
import { readJsx } from './jsx'
import type { ReaderState } from './model'
import { isReadable, type ReadResult, type SourceInput } from './source-files'

/**
 * Reads React source files and describes their data flow as a flow file.
 * Everything happens in memory: no files are written and nothing is fetched.
 */
export function readCode(inputs: SourceInput[], flowName: string): ReadResult {
  const project = new Project({
    useInMemoryFileSystem: true,
    // Only syntax is read, so the standard library and imported packages are not needed.
    skipLoadingLibFiles: true,
    skipFileDependencyResolution: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true },
  })
  const files = inputs
    .filter((input) => isReadable(input.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((input) => project.createSourceFile(`/${input.path.replace(/^\/+/, '')}`, input.text, { overwrite: true }))

  const state: ReaderState = {
    components: new Map(),
    contexts: new Map(),
    storeHooks: new Map(),
    nodes: [],
    edges: [],
    usages: [],
    ids: new Set(),
    typeDeclarations: new Map(),
    notes: [],
    propValues: new Map(),
  }

  collect(state, files)
  const components = [...state.components.values()]
  // Each pass needs the one before it for every component: hooks before JSX
  // (props carry state), JSX before calls (callbacks arrive as props).
  for (const component of components) readHooks(state, component)
  for (const component of components) readJsx(state, component)
  for (const component of components) {
    readEffects(state, component)
    readWrites(state, component)
    readMutations(state, component)
  }

  const flow = assemble(state, flowName)
  const notes = [...new Set(state.notes)]
  return { yaml: toYaml(flow, notes), notes, componentCount: components.length }
}
