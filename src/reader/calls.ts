import { Node, type CallExpression } from 'ts-morph'
import { calleeName, sourceOf } from './collect'
import { attributeOwner } from './jsx'
import { fieldOf, lowerFirst, rootOfPath, uniqueId, upperFirst, type ComponentInfo, type Fn, type Out, type ReaderState, type Target } from './model'
import { dataOf, isFn, resolve, targetsOfCall, targetsOfFn, unwrap, valueOf } from './resolve'

const EFFECT_HOOKS = /^use(Layout|Insertion)?Effect$/
/** Signs that an effect talks to something outside React. */
const OUTSIDE = /\b(window|document|fetch|localStorage|sessionStorage|setTimeout|setInterval|addEventListener|subscribe|WebSocket|navigator|console)\b/
const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'])
const ASSIGNMENTS = /^(=|\+=|-=|\*=|\/=|%=|\*\*=|&&=|\|\|=|\?\?=)$/

type Context = 'triggered' | 'effect' | 'defined'

const nearestFunction = (node: Node, component: ComponentInfo): Fn | undefined =>
  node.getAncestors().find((ancestor): ancestor is Fn => isFn(ancestor) && ancestor !== component.fn)

/** The local name a function is known by: `const f = () => …`, `function f() {}`, `const f = useCallback(…)`. */
function localName(fn: Fn): string | undefined {
  if (Node.isFunctionDeclaration(fn)) return fn.getName()
  let parent: Node | undefined = fn.getParent()
  if (Node.isCallExpression(parent) && /^use(Callback|Memo)$/.test(calleeName(parent))) parent = parent.getParent()
  return Node.isVariableDeclaration(parent) ? parent.getName() : undefined
}

class Triggers {
  private readonly localCache = new Map<string, boolean>()
  private readonly state: ReaderState
  private readonly component: ComponentInfo

  constructor(state: ReaderState, component: ComponentInfo) {
    this.state = state
    this.component = component
  }

  /**
   * Where a piece of code runs from: `triggered` when this component makes it
   * happen (render, or a handler on one of its DOM elements), `effect` inside
   * an effect, `defined` when it is only written here and handed to a child.
   */
  contextOf(node: Node): Context {
    const fn = nearestFunction(node, this.component)
    if (!fn) return 'triggered'

    const owner = attributeOwner(this.state, fn)
    if (owner) return owner === 'dom' ? 'triggered' : 'defined'

    const name = localName(fn)
    if (name) return this.localIsTriggered(name) ? 'triggered' : 'defined'

    const parent = fn.getParent()
    if (Node.isCallExpression(parent) && EFFECT_HOOKS.test(calleeName(parent))) return 'effect'
    // A callback handed to map(), then(), setTimeout(): it runs where that call runs.
    return this.contextOf(fn)
  }

  /** A local function counts when a DOM element uses it, or triggered code calls it. */
  private localIsTriggered(name: string): boolean {
    const cached = this.localCache.get(name)
    if (cached !== undefined) return cached
    this.localCache.set(name, false) // while deciding: breaks recursion between two local functions

    const references = this.component.fn.getDescendants().filter((n) => Node.isIdentifier(n) && n.getText() === name)
    const triggered = references.some((reference) => {
      if (attributeOwner(this.state, reference) === 'dom') return true
      const call = reference.getParent()
      return Node.isCallExpression(call) && call.getExpression() === reference && this.contextOf(call) === 'triggered'
    })
    this.localCache.set(name, triggered)
    return triggered
  }
}

const writeVia = (callee: string, target: Target) => (callee === target.via ? target.via : `${callee} → ${target.via}`)

function addWrites(state: ReaderState, component: ComponentInfo, callee: string, targets: Target[], seen: Set<string>) {
  for (const target of targets) {
    const via = writeVia(callee, target)
    const key = `${target.data}:${via}`
    if (seen.has(key)) continue
    seen.add(key)
    state.edges.push({ kind: 'writes', from: component.id, to: target.data, via })
  }
}

/** Fourth pass, part one: where this component changes data, directly or through callback props. */
export function readWrites(state: ReaderState, component: ComponentInfo) {
  const triggers = new Triggers(state, component)
  const seen = new Set<string>()

  for (const call of component.fn.getDescendants().filter(Node.isCallExpression)) {
    const callee = call.getExpression()
    const targets = targetsOfCall(state, component, callee)
    if (targets.length && triggers.contextOf(call) === 'triggered') addWrites(state, component, callee.getText().replace(/^props\./, ''), targets, seen)
  }
  // `<input onChange={onChange} />`: handing a callback to a DOM element triggers it too.
  for (const expression of component.domAttributes) {
    const inner = unwrap(expression)
    if (isFn(inner)) continue // its calls were handled above
    const binding = resolve(state, component, inner)
    if (binding?.kind === 'setter' || binding?.kind === 'prop')
      addWrites(state, component, inner.getText().replace(/^props\./, ''), valueOf(state, component, inner).targets, seen)
  }
}

const mutationEdge = (component: ComponentInfo, path: string, op: string): Out => {
  const field = fieldOf(path)
  return { kind: 'mutates', from: component.id, to: rootOfPath(path), op: op.replace(/\s+/g, ' ').slice(0, 80), ...(field ? { fields: [field] } : {}) }
}

/** The data path a statement changes in place, if it does. */
function mutatedPath(state: ReaderState, component: ComponentInfo, node: Node): string | null {
  let target: Node | undefined
  if (Node.isBinaryExpression(node) && ASSIGNMENTS.test(node.getOperatorToken().getText())) target = node.getLeft()
  else if (Node.isPrefixUnaryExpression(node) || Node.isPostfixUnaryExpression(node)) {
    if (/\+\+|--/.test(node.getText())) target = node.getOperand()
  } else if (Node.isCallExpression(node)) {
    const callee = node.getExpression()
    if (Node.isPropertyAccessExpression(callee) && MUTATORS.has(callee.getName())) {
      const data = dataOf(state, component, callee.getExpression())
      return data && !data.fresh && !data.wrapper ? data.path : null
    }
  }
  if (!target || !(Node.isPropertyAccessExpression(target) || Node.isElementAccessExpression(target))) return null
  // `ref.current = x` is how refs are meant to be written; only real data counts.
  const holder = dataOf(state, component, target.getExpression())
  if (!holder || holder.fresh || holder.wrapper) return null
  return dataOf(state, component, target)?.path ?? null
}

/** Fourth pass, part two: `item.qty += 1`, `orders.push(x)` on state. */
export function readMutations(state: ReaderState, component: ComponentInfo) {
  const seen = new Set<string>()
  for (const node of component.fn.getDescendants()) {
    const path = mutatedPath(state, component, node)
    if (!path || seen.has(node.getText())) continue
    seen.add(node.getText())
    state.edges.push(mutationEdge(component, path, node.getText()))
  }
}

function effectId(state: ReaderState, component: ComponentInfo, fn: Node | undefined, sets: string[]): string {
  // `useEffect(function syncOrders() { … })` names itself; otherwise name it after what it sets.
  const own = fn && Node.isFunctionExpression(fn) ? fn.getName() : undefined
  const guess = sets.length ? `sync${upperFirst(sets[0])}` : `${lowerFirst(component.id)}Effect`
  return uniqueId(state, own ?? guess)
}

function readEffect(state: ReaderState, component: ComponentInfo, call: CallExpression) {
  const [fn, dependencies] = call.getArguments()
  const dependencyPaths = Node.isArrayLiteralExpression(dependencies)
    ? dependencies.getElements().flatMap((element) => dataOf(state, component, element)?.path ?? [])
    : []
  const deps = [...new Set(dependencyPaths)]
  const sets = isFn(fn) ? [...new Set(targetsOfFn(state, component, fn).map((target) => target.data))] : []
  const id = effectId(state, component, fn, sets)

  state.nodes.push({
    id,
    kind: 'effect',
    owner: component.id,
    deps,
    sets,
    ...(fn && OUTSIDE.test(fn.getText()) ? { external: true } : {}),
    source: sourceOf(call),
  })
  // Data set from other data in an effect is stored derived data: record it as the format asks.
  for (const from of new Set(deps.map(rootOfPath)))
    for (const to of sets) if (from !== to) state.edges.push({ kind: 'derives', from, to, via: id })
}

/** Fourth pass, part three: effects, with their dependencies and what they set. */
export function readEffects(state: ReaderState, component: ComponentInfo) {
  for (const call of component.fn.getDescendants().filter(Node.isCallExpression))
    if (EFFECT_HOOKS.test(calleeName(call))) readEffect(state, component, call)
}
