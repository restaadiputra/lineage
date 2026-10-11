import type { ArrowFunction, FunctionDeclaration, FunctionExpression, Node } from 'ts-morph'

/**
 * Shared shapes for the code reader: a static, name-based reading of React
 * source that produces a flow file without any AI. It does not run the code or
 * resolve imports; it recognises the common ways of writing components, hooks
 * and JSX, and says what it skipped.
 */

export type Fn = ArrowFunction | FunctionDeclaration | FunctionExpression

/** What a local name inside a component stands for. */
export type Binding =
  /** holds data at `path`; `fresh` when it is a new value every render (a `.filter()` result) */
  | { kind: 'data'; path: string; fresh?: boolean; wrapper?: 'query' | 'ref' }
  /** a state setter */
  | { kind: 'setter'; target: string; name: string }
  /** one prop, by its name in the parent's JSX */
  | { kind: 'prop'; name: string }
  /** the whole props object (`function X(props)`) */
  | { kind: 'props' }
  /** a function defined in the component */
  | { kind: 'callback'; fn: Fn; stable: boolean }
  /** anything else; `unstable` when it is a new object or array every render */
  | { kind: 'value'; unstable: boolean }

/** A data node reached by calling something, and the name of the setter or action that does it. */
export interface Target {
  data: string
  via: string
}

/** What a JSX attribute passes to a child. */
export interface PropValue {
  /** original data path the value carries */
  data?: string
  callback?: boolean
  /** a new object, array or function on every render of the parent */
  unstable?: boolean
  /** setters and actions the value ends up calling */
  targets: Target[]
}

export interface RenderLink {
  id: string
  list?: { key: string }
  when?: string
}

/** `<Child attr={expr} />` inside `parent`. `expr` is null for `attr` and `attr="text"`. */
export interface Usage {
  parent: string
  child: string
  attr: string
  expr: Node | null
}

export interface ComponentInfo {
  id: string
  fn: Fn
  /** "path/to/file.tsx:line" */
  source: string
  memo: boolean
  props: Record<string, string>
  bindings: Map<string, Binding>
  renders: RenderLink[]
  /** attribute values on DOM elements: these are where callbacks get triggered */
  domAttributes: Node[]
}

/** A node or edge of the flow being built, as it will be written to YAML. */
export type Out = Record<string, unknown>

export interface ReaderState {
  components: Map<string, ComponentInfo>
  /** context variable name → node under construction */
  contexts: Map<string, Out>
  /** store hook name (`useUiStore`) → store id (`uiStore`) */
  storeHooks: Map<string, string>
  /** data and effect nodes, in the order they were found */
  nodes: Out[]
  edges: Out[]
  usages: Usage[]
  /** every id in use, so new ones stay unique */
  ids: Set<string>
  /** type and interface declarations by name */
  typeDeclarations: Map<string, string | Record<string, string>>
  /** things the reader saw but did not understand */
  notes: string[]
  propValues: Map<string, PropValue | 'pending'>
}

export const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
export const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** An id nobody has yet: the name itself, else prefixed with its owner, else numbered. */
export function uniqueId(state: ReaderState, name: string, owner?: string): string {
  const candidates = [name, ...(owner ? [`${owner}_${name}`] : [])]
  let id = candidates.find((candidate) => !state.ids.has(candidate))
  for (let n = 2; !id; n++) if (!state.ids.has(`${name}${n}`)) id = `${name}${n}`
  state.ids.add(id)
  return id
}

export const rootOfPath = (path: string) => /^[^.[]+/.exec(path)?.[0] ?? path

/** "orders[].items" relative to its node "orders" → "[].items"; undefined for the node itself. */
export function fieldOf(path: string): string | undefined {
  const rest = path.slice(rootOfPath(path).length).replace(/^\./, '')
  return rest || undefined
}
