import { Node, type CallExpression, type VariableDeclaration } from 'ts-morph'
import { calleeName, sourceOf } from './collect'
import { uniqueId, type Binding, type ComponentInfo, type Out, type ReaderState } from './model'
import { dataOf, isFn, resolve, unwrap } from './resolve'

const QUERY_HOOKS: Record<string, string> = {
  useQuery: 'react-query',
  useSuspenseQuery: 'react-query',
  useInfiniteQuery: 'react-query',
  useSWR: 'swr',
}

interface Declared {
  state: ReaderState
  component: ComponentInfo
  declaration: VariableDeclaration
  call: CallExpression
}

const typeArgument = (call: CallExpression) => call.getTypeArguments()[0]?.getText().replace(/\s+/g, ' ')

/** A type for `useState(initial)` when no `<T>` is written: only what a literal makes obvious. */
function typeOfLiteral(node: Node | undefined): string {
  if (!node) return 'unknown'
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) return 'string'
  if (Node.isNumericLiteral(node)) return 'number'
  if (Node.isTrueLiteral(node) || Node.isFalseLiteral(node)) return 'boolean'
  if (Node.isArrayLiteralExpression(node)) return 'unknown[]'
  return 'unknown'
}

/** Local names of `const [a, b] = …`, with undefined for skipped positions. */
function arrayNames(declaration: VariableDeclaration): (string | undefined)[] {
  const nameNode = declaration.getNameNode()
  if (!Node.isArrayBindingPattern(nameNode)) return []
  return nameNode.getElements().map((element) => (Node.isBindingElement(element) ? element.getName() : undefined))
}

/** `const { a, b: c } = …` as [field, local name] pairs. */
function objectNames(declaration: VariableDeclaration): [field: string, local: string][] {
  const nameNode = declaration.getNameNode()
  if (!Node.isObjectBindingPattern(nameNode)) return []
  return nameNode.getElements().map((element) => [element.getPropertyNameNode()?.getText() ?? element.getName(), element.getName()])
}

const simpleName = (declaration: VariableDeclaration) => {
  const nameNode = declaration.getNameNode()
  return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined
}

/** `useState`, `useReducer`: a state node, its value and its setter. */
function declareState({ state, component, declaration, call }: Declared, hook: string) {
  const [value, setter] = arrayNames(declaration)
  if (!value) return
  const id = uniqueId(state, value, component.id)
  const type = typeArgument(call) ?? (hook === 'useState' ? typeOfLiteral(call.getArguments()[0]) : 'unknown')
  state.nodes.push({ id, kind: 'state', owner: component.id, ...(hook === 'useState' ? {} : { hook }), type, source: sourceOf(declaration) })
  component.bindings.set(value, { kind: 'data', path: id })
  if (setter) component.bindings.set(setter, { kind: 'setter', target: id, name: setter })
}

function declareRef({ state, component, declaration, call }: Declared) {
  const name = simpleName(declaration)
  if (!name) return
  const id = uniqueId(state, name, component.id)
  state.nodes.push({ id, kind: 'state', owner: component.id, hook: 'useRef', type: typeArgument(call) ?? 'unknown', source: sourceOf(declaration) })
  component.bindings.set(name, { kind: 'data', path: id, wrapper: 'ref' })
}

/** Bind the names a declaration introduces to `source` or to fields of it, and report the fields read. */
function bindFields(component: ComponentInfo, declaration: VariableDeclaration, source: string): string[] | undefined {
  const name = simpleName(declaration)
  if (name) {
    component.bindings.set(name, { kind: 'data', path: source })
    return undefined
  }
  const fields = objectNames(declaration)
  for (const [field, local] of fields) component.bindings.set(local, { kind: 'data', path: `${source}.${field}` })
  return fields.map(([field]) => field)
}

const readsEdge = (from: string, to: string, fields: string[] | undefined): Out => ({
  kind: 'reads',
  from,
  to,
  ...(fields?.length ? { fields } : {}),
})

function declareContextRead({ state, component, declaration }: Declared, context: string) {
  state.edges.push(readsEdge(context, component.id, bindFields(component, declaration, context)))
}

/** `useStore()` reads everything; `useStore((s) => s.theme)` reads one field. */
function declareStoreRead({ state, component, declaration, call }: Declared, store: string) {
  const selector = call.getArguments()[0]
  const body = selector && Node.isArrowFunction(selector) ? unwrap(selector.getBody()) : undefined
  const parameter = selector && Node.isArrowFunction(selector) ? selector.getParameters()[0]?.getName() : undefined
  // `s.theme` or `s.cart.items`: the path after the parameter.
  const selected = body && parameter && body.getText().startsWith(`${parameter}.`) ? body.getText().slice(parameter.length + 1) : undefined

  if (selected && /^[\w$.]+$/.test(selected)) {
    const name = simpleName(declaration)
    if (name) component.bindings.set(name, { kind: 'data', path: `${store}.${selected}` })
    state.edges.push(readsEdge(store, component.id, [selected]))
    return
  }
  if (selector) state.notes.push(`${component.id} selects from ${store} with a selector the reader could not follow; recorded as reading all of it.`)
  state.edges.push(readsEdge(store, component.id, bindFields(component, declaration, store)))
}

/** The query key as written: `queryKey: [...]` in the options object, or the first argument. */
function queryKey(call: CallExpression): string | undefined {
  const [first] = call.getArguments()
  if (!first) return undefined
  if (Node.isObjectLiteralExpression(first)) {
    const property = first.getProperty('queryKey')
    return Node.isPropertyAssignment(property) ? property.getInitializer()?.getText() : undefined
  }
  return first.getText()
}

function declareQuery({ state, component, declaration, call }: Declared, library: string) {
  const key = queryKey(call)
  const firstWord = /[A-Za-z_$][\w$]*/.exec(key ?? '')?.[0]
  const id = uniqueId(state, simpleName(declaration) ?? `${firstWord ?? 'data'}Query`, component.id)
  state.nodes.push({ id, kind: 'query', library, ...(key ? { key } : {}), type: typeArgument(call) ?? 'unknown', source: sourceOf(declaration) })
  state.edges.push(readsEdge(id, component.id, undefined))

  const name = simpleName(declaration)
  if (name) component.bindings.set(name, { kind: 'data', path: id, wrapper: 'query' })
  // `const { data: orders, isLoading } = useQuery(…)`: only `data` is the data.
  for (const [field, local] of objectNames(declaration))
    component.bindings.set(local, field === 'data' ? { kind: 'data', path: id } : { kind: 'value', unstable: false })
}

/** Any other initializer: a renamed or derived piece of data, a local function, or just a value. */
function declareLocal(state: ReaderState, component: ComponentInfo, declaration: VariableDeclaration, initializer: Node) {
  const name = simpleName(declaration)
  if (isFn(initializer)) {
    if (name) component.bindings.set(name, { kind: 'callback', fn: initializer, stable: false })
    return
  }
  const data = dataOf(state, component, initializer)
  if (data) {
    if (name) component.bindings.set(name, data)
    for (const [field, local] of objectNames(declaration)) component.bindings.set(local, { kind: 'data', path: `${data.path}.${field}` })
    return
  }
  const fresh = Node.isObjectLiteralExpression(initializer) || Node.isArrayLiteralExpression(initializer)
  const binding: Binding = resolve(state, component, initializer) ?? { kind: 'value', unstable: fresh }
  if (name) component.bindings.set(name, binding)
}

/** `useMemo` gives a stable value; `useCallback` a stable function. */
function declareMemoized({ state, component, declaration, call }: Declared, hook: string) {
  const name = simpleName(declaration)
  const first = call.getArguments()[0]
  if (!name || !first) return
  if (hook === 'useCallback' && isFn(first)) {
    component.bindings.set(name, { kind: 'callback', fn: first, stable: true })
    return
  }
  const body = Node.isArrowFunction(first) ? first.getBody() : undefined
  const data = body && !Node.isBlock(body) ? dataOf(state, component, body) : null
  component.bindings.set(name, data ? { kind: 'data', path: data.path } : { kind: 'value', unstable: false })
}

function declareFromHook(declared: Declared, hook: string) {
  const { state, component, call } = declared
  const argument = call.getArguments()[0]?.getText() ?? ''
  if (hook === 'useState' || hook === 'useReducer') return declareState(declared, hook)
  if (hook === 'useRef') return declareRef(declared)
  if (hook === 'useMemo' || hook === 'useCallback') return declareMemoized(declared, hook)
  if ((hook === 'useContext' || hook === 'use') && state.contexts.has(argument)) return declareContextRead(declared, argument)
  if (QUERY_HOOKS[hook]) return declareQuery(declared, QUERY_HOOKS[hook])
  const store = state.storeHooks.get(hook)
  if (store) return declareStoreRead(declared, store)
  state.notes.push(`${component.id} calls ${hook}(), a hook the reader does not follow; anything it holds is missing.`)
}

/**
 * Second pass: read the top-level statements of a component in order, turning
 * hook calls into nodes and remembering what every local name stands for.
 */
export function readHooks(state: ReaderState, component: ComponentInfo) {
  const body = component.fn.getBody()
  if (!body || !Node.isBlock(body)) return

  for (const statement of body.getStatements()) {
    if (Node.isFunctionDeclaration(statement)) {
      const name = statement.getName()
      if (name) component.bindings.set(name, { kind: 'callback', fn: statement, stable: false })
      continue
    }
    if (!Node.isVariableStatement(statement)) continue
    for (const declaration of statement.getDeclarations()) {
      const initializer = declaration.getInitializer()
      if (!initializer) continue
      const value = unwrap(initializer)
      const hook = calleeName(value)
      if (Node.isCallExpression(value) && /^use([A-Z]|$)/.test(hook)) declareFromHook({ state, component, declaration, call: value }, hook)
      else declareLocal(state, component, declaration, value)
    }
  }
}
