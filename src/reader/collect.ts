import { Node, type SourceFile, type TypeNode } from 'ts-morph'
import { lowerFirst, type ComponentInfo, type Fn, type Out, type ReaderState } from './model'
import { isFn, unwrap } from './resolve'

/** `memo(X)`, `React.memo(X)`, `forwardRef(X)`: wrappers around a component function. */
const WRAPPERS = /^(React\.)?(memo|forwardRef)$/

const calleeName = (call: Node) => (Node.isCallExpression(call) ? call.getExpression().getText().replace(/^React\./, '') : '')

const sourceOf = (node: Node) => `${node.getSourceFile().getFilePath().replace(/^\//, '')}:${node.getStartLineNumber()}`

const hasJsx = (fn: Fn) => fn.getDescendants().some((n) => Node.isJsxElement(n) || Node.isJsxSelfClosingElement(n) || Node.isJsxFragment(n))

/** The component function inside `memo(forwardRef(function …))`, and whether memo was on the way. */
function peel(initializer: Node): { fn: Fn; memo: boolean } | null {
  let node = unwrap(initializer)
  let memo = false
  while (Node.isCallExpression(node) && WRAPPERS.test(node.getExpression().getText())) {
    memo ||= /memo$/.test(node.getExpression().getText())
    const inner = node.getArguments()[0]
    if (!inner) return null
    node = unwrap(inner)
  }
  return isFn(node) ? { fn: node, memo } : null
}

/** Fields of an inline `{ a: string }`, or of a named interface or type alias. */
function propsFromType(state: ReaderState, type: TypeNode | undefined): Record<string, string> {
  if (!type) return {}
  if (Node.isTypeLiteral(type)) return membersOf(type)
  const declared = state.typeDeclarations.get(type.getText())
  return typeof declared === 'object' ? declared : {}
}

function membersOf(node: Node): Record<string, string> {
  const fields: Record<string, string> = {}
  const members = Node.isTypeLiteral(node) || Node.isInterfaceDeclaration(node) ? node.getMembers() : []
  for (const member of members) {
    if (!Node.isPropertySignature(member)) continue
    fields[member.getName()] = member.getTypeNode()?.getText().replace(/\s+/g, ' ') ?? 'unknown'
  }
  return fields
}

function addComponent(state: ReaderState, id: string, fn: Fn, memo: boolean, declaration: Node) {
  if (!/^[A-Z]/.test(id) || !hasJsx(fn)) return
  if (state.components.has(id)) {
    state.notes.push(`Two components are called ${id}; only the first (${state.components.get(id)?.source}) was read.`)
    return
  }
  const component: ComponentInfo = {
    id,
    fn,
    source: sourceOf(declaration),
    memo,
    props: propsFromType(state, fn.getParameters()[0]?.getTypeNode()),
    bindings: new Map(),
    renders: [],
    domAttributes: [],
  }
  bindProps(component)
  state.components.set(id, component)
  state.ids.add(id)
}

/** `({ orders, onSelect: select })` or `(props)`: what the parameter names stand for. */
function bindProps(component: ComponentInfo) {
  const nameNode = component.fn.getParameters()[0]?.getNameNode()
  if (!nameNode) return
  if (Node.isIdentifier(nameNode)) component.bindings.set(nameNode.getText(), { kind: 'props' })
  if (!Node.isObjectBindingPattern(nameNode)) return
  for (const element of nameNode.getElements()) {
    const prop = element.getPropertyNameNode()?.getText() ?? element.getName()
    component.bindings.set(element.getName(), { kind: 'prop', name: prop })
    component.props[prop] ??= 'unknown'
  }
}

function collectTypes(state: ReaderState, file: SourceFile) {
  for (const declaration of file.getInterfaces()) state.typeDeclarations.set(declaration.getName(), membersOf(declaration))
  for (const alias of file.getTypeAliases()) {
    const type = alias.getTypeNode()
    if (!type) continue
    state.typeDeclarations.set(alias.getName(), Node.isTypeLiteral(type) ? membersOf(type) : type.getText().replace(/\s+/g, ' '))
  }
}

/** Module-level `createContext<T>()` and zustand `create<T>()`. */
function collectModuleData(state: ReaderState, file: SourceFile) {
  for (const declaration of file.getVariableDeclarations()) {
    const initializer = declaration.getInitializer()
    if (!initializer) continue
    const name = declaration.getName()
    // zustand is written both as create<T>(…) and create<T>()(…): look at the innermost call.
    let call = unwrap(initializer)
    while (Node.isCallExpression(call) && Node.isCallExpression(call.getExpression())) call = call.getExpression()
    if (!Node.isCallExpression(call)) continue
    const type = call.getTypeArguments()[0]?.getText() ?? 'unknown'

    if (calleeName(call) === 'createContext') {
      const node: Out = { id: name, kind: 'context', provider: undefined, type, source: sourceOf(declaration) }
      state.contexts.set(name, node)
      state.ids.add(name)
    } else if (calleeName(call) === 'create' && /^use[A-Z]/.test(name)) {
      // FORMAT.md: `useCartStore` → `cartStore`.
      const id = lowerFirst(name.replace(/^use/, ''))
      state.storeHooks.set(name, id)
      state.ids.add(id)
      state.nodes.push({ id, kind: 'store', library: 'zustand', type, source: sourceOf(declaration) })
    }
  }
}

function collectComponents(state: ReaderState, file: SourceFile) {
  for (const fn of file.getFunctions()) {
    const name = fn.getName()
    if (name) addComponent(state, name, fn, false, fn)
  }
  for (const declaration of file.getVariableDeclarations()) {
    const initializer = declaration.getInitializer()
    const peeled = initializer && peel(initializer)
    if (peeled) addComponent(state, declaration.getName(), peeled.fn, peeled.memo, declaration)
  }
  // `export default memo(OrderList)` marks a component declared earlier.
  for (const assignment of file.getExportAssignments()) {
    const expression = unwrap(assignment.getExpression())
    if (!Node.isCallExpression(expression) || !/memo$/.test(expression.getExpression().getText())) continue
    const wrapped = state.components.get(expression.getArguments()[0]?.getText() ?? '')
    if (wrapped) wrapped.memo = true
  }
}

/** First pass over every file: types, then module-level data, then components. */
export function collect(state: ReaderState, files: SourceFile[]) {
  for (const file of files) collectTypes(state, file)
  for (const file of files) collectModuleData(state, file)
  for (const file of files) collectComponents(state, file)
}

export { calleeName, sourceOf }
