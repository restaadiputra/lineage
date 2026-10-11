import { Node } from 'ts-morph'
import { rootOfPath, type Binding, type ComponentInfo, type Fn, type PropValue, type ReaderState, type Target } from './model'

/** Array methods whose callback receives one element of the array. */
const ITERATORS = new Set(['map', 'forEach', 'filter', 'find', 'findLast', 'some', 'every', 'flatMap'])
/** Methods that return a new array of the same data, so mutating the result is harmless. */
const COPIES = new Set(['filter', 'map', 'slice', 'concat', 'flat', 'flatMap', 'toSorted', 'toReversed', 'toSpliced', 'with'])
/** Methods that return one element. */
const PICKS = new Set(['find', 'findLast', 'at'])
/** Wrapper objects whose fields all mean "the data": `query.data`, `ref.current`. */
const WRAPPER_FIELDS = { query: /^(data|isLoading|isPending|isFetching|error|status)$/, ref: /^current$/ }

export const isFn = (node: Node | undefined): node is Fn =>
  !!node && (Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node))

/** Strip parentheses, `as` casts and `!`, which do not change what a value is. */
export function unwrap(node: Node): Node {
  let current = node
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isNonNullExpression(current) ||
    Node.isSatisfiesExpression(current)
  )
    current = current.getExpression()
  return current
}

/** The functions around a node, innermost first, up to but not including the component. */
function enclosingFunctions(node: Node, component: ComponentInfo): Fn[] {
  const fns: Fn[] = []
  for (const ancestor of node.getAncestors()) {
    if (ancestor === component.fn) break
    if (isFn(ancestor)) fns.push(ancestor)
  }
  return fns
}

/** When `fn` is the callback of `data.map(…)` and friends: the array being walked. */
function iteratedExpression(fn: Fn): Node | null {
  const call = fn.getParent()
  if (!Node.isCallExpression(call) || call.getArguments()[0] !== fn) return null
  const callee = call.getExpression()
  return Node.isPropertyAccessExpression(callee) && ITERATORS.has(callee.getName()) ? callee.getExpression() : null
}

/** A name declared as a parameter of an inner function: an array element, or something unknown. */
function fromParameter(state: ReaderState, component: ComponentInfo, fn: Fn, name: string): Binding | null | undefined {
  const [first, ...others] = fn.getParameters()
  if (others.some((parameter) => parameter.getName() === name)) return null
  if (!first) return undefined

  const nameNode = first.getNameNode()
  const destructured = Node.isObjectBindingPattern(nameNode)
    ? nameNode.getElements().find((element) => element.getName() === name)
    : undefined
  if (!destructured && first.getName() !== name) return undefined

  const array = iteratedExpression(fn)
  const base = array ? dataOf(state, component, array) : null
  if (!base) return null
  const field = destructured ? `.${destructured.getPropertyNameNode()?.getText() ?? name}` : ''
  return { kind: 'data', path: `${base.path}[]${field}` }
}

function resolveName(state: ReaderState, component: ComponentInfo, node: Node, name: string): Binding | null {
  for (const fn of enclosingFunctions(node, component)) {
    const binding = fromParameter(state, component, fn, name)
    // null: a parameter with this name that is not data. It hides the component's own binding.
    if (binding !== undefined) return binding
  }
  return component.bindings.get(name) ?? null
}

function resolveMember(state: ReaderState, component: ComponentInfo, object: Node, name: string): Binding | null {
  const base = resolve(state, component, object)
  if (!base) return null
  if (base.kind === 'props') return { kind: 'prop', name }
  const data = base.kind === 'prop' ? propData(state, component, base.name) : base
  if (data?.kind !== 'data') return null
  if (data.wrapper && WRAPPER_FIELDS[data.wrapper].test(name)) return { kind: 'data', path: data.path, fresh: data.fresh }
  return { kind: 'data', path: `${data.path}.${name}`, fresh: data.fresh }
}

function resolveCall(state: ReaderState, component: ComponentInfo, callee: Node): Binding | null {
  if (!Node.isPropertyAccessExpression(callee)) return null
  const base = dataOf(state, component, callee.getExpression())
  if (!base) return null
  const method = callee.getName()
  if (COPIES.has(method)) return { kind: 'data', path: base.path, fresh: true }
  if (PICKS.has(method)) return { kind: 'data', path: `${base.path}[]`, fresh: base.fresh }
  return null
}

/** What an expression stands for inside a component, or null when the reader cannot tell. */
export function resolve(state: ReaderState, component: ComponentInfo, expression: Node): Binding | null {
  const node = unwrap(expression)
  if (Node.isIdentifier(node)) return resolveName(state, component, node, node.getText())
  if (Node.isPropertyAccessExpression(node)) return resolveMember(state, component, node.getExpression(), node.getName())
  if (Node.isElementAccessExpression(node)) {
    const base = dataOf(state, component, node.getExpression())
    return base && { kind: 'data', path: `${base.path}[]`, fresh: base.fresh }
  }
  if (Node.isCallExpression(node)) return resolveCall(state, component, node.getExpression())
  return null
}

type DataBinding = Extract<Binding, { kind: 'data' }>

/** A prop as data, traced back through the parents that pass it. */
function propData(state: ReaderState, component: ComponentInfo, prop: string): DataBinding | null {
  const { data } = propValue(state, component, prop)
  return data ? { kind: 'data', path: data } : null
}

/** The data an expression carries, following props back to where the data lives. */
export function dataOf(state: ReaderState, component: ComponentInfo, expression: Node): DataBinding | null {
  const binding = resolve(state, component, expression)
  if (binding?.kind === 'data') return binding
  if (binding?.kind === 'prop') return propData(state, component, binding.name)
  return null
}

/** Setters and actions reached by calling `callee(...)`. `name` is how the caller names it. */
function targetsOfCallee(state: ReaderState, component: ComponentInfo, callee: Node, seen: Set<Fn>): Target[] {
  const binding = resolve(state, component, callee)
  if (!binding) return []
  if (binding.kind === 'setter') return [{ data: binding.target, via: binding.name }]
  if (binding.kind === 'prop') return propValue(state, component, binding.name).targets
  if (binding.kind === 'callback') return targetsOfFn(state, component, binding.fn, seen)
  // Calling a field of a store or context is how their actions are used: `add(item)`.
  // (On state, `orders.map(…)` is just an array method.)
  if (binding.kind === 'data' && binding.path.includes('.')) {
    const root = rootOfPath(binding.path)
    const holdsActions = state.contexts.has(root) || [...state.storeHooks.values()].includes(root)
    if (holdsActions) return [{ data: root, via: binding.path.slice(root.length + 1) }]
  }
  return []
}

/** Every setter or action a function ends up calling. */
export function targetsOfFn(state: ReaderState, component: ComponentInfo, fn: Fn, seen = new Set<Fn>()): Target[] {
  if (seen.has(fn)) return []
  seen.add(fn)
  const targets = new Map<string, Target>()
  for (const call of fn.getDescendants().filter(Node.isCallExpression))
    for (const target of targetsOfCallee(state, component, call.getExpression(), seen)) targets.set(`${target.data}:${target.via}`, target)
  return [...targets.values()]
}

/** What the targets of a direct call are, for the component that makes the call. */
export function targetsOfCall(state: ReaderState, component: ComponentInfo, callee: Node): Target[] {
  const binding = resolve(state, component, callee)
  // A local function's own calls are judged where they are written, not at its call site.
  return binding?.kind === 'callback' ? [] : targetsOfCallee(state, component, callee, new Set())
}

/** What a JSX attribute value passes down. */
export function valueOf(state: ReaderState, component: ComponentInfo, expression: Node | null): PropValue {
  if (!expression) return { targets: [] }
  const node = unwrap(expression)
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node))
    return { callback: true, unstable: true, targets: targetsOfFn(state, component, node) }
  if (Node.isObjectLiteralExpression(node) || Node.isArrayLiteralExpression(node)) return { unstable: true, targets: [] }

  const binding = resolve(state, component, node)
  switch (binding?.kind) {
    case 'data':
      return { data: binding.path, unstable: binding.fresh || undefined, targets: [] }
    case 'setter':
      return { callback: true, targets: [{ data: binding.target, via: binding.name }] }
    case 'callback':
      return { callback: true, unstable: !binding.stable || undefined, targets: targetsOfFn(state, component, binding.fn) }
    case 'prop':
      return propValue(state, component, binding.name)
    case 'value':
      return { unstable: binding.unstable || undefined, targets: [] }
    default:
      return { targets: [] }
  }
}

/** What a component receives as a prop, from the first parent that passes something traceable. */
export function propValue(state: ReaderState, component: ComponentInfo, prop: string): PropValue {
  const key = `${component.id}:${prop}`
  const known = state.propValues.get(key)
  // 'pending' means a cycle of components passing the prop round; stop there.
  if (known) return known === 'pending' ? { targets: [] } : known

  state.propValues.set(key, 'pending')
  let value: PropValue = { targets: [] }
  for (const usage of state.usages) {
    if (usage.child !== component.id || usage.attr !== prop) continue
    const parent = state.components.get(usage.parent)
    if (!parent) continue
    value = valueOf(state, parent, usage.expr)
    if (value.data || value.callback) break
  }
  state.propValues.set(key, value)
  return value
}
