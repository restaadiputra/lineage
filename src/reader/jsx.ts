import { Node, type JsxOpeningElement, type JsxSelfClosingElement } from 'ts-morph'
import type { ComponentInfo, ReaderState, RenderLink } from './model'
import { isFn, resolve, unwrap } from './resolve'

type Element = JsxOpeningElement | JsxSelfClosingElement

/** The expression inside `attr={…}`; null for `attr` and `attr="text"`. */
function attributeExpression(attribute: Node): Node | null {
  if (!Node.isJsxAttribute(attribute)) return null
  const initializer = attribute.getInitializer()
  return initializer && Node.isJsxExpression(initializer) ? (initializer.getExpression() ?? null) : null
}

/** `key={order.id}` → "id"; the map callback's index parameter → "index"; no key → "none". */
function listKey(element: Element, mapCallback: Node): string {
  const key = element.getAttribute('key')
  const expression = key && attributeExpression(key)
  if (!expression) return 'none'
  const text = expression.getText()
  const indexParameter = isFn(mapCallback) ? mapCallback.getParameters()[1]?.getName() : undefined
  if (text === indexParameter) return 'index'
  return Node.isPropertyAccessExpression(expression) ? expression.getName() : text
}

/** Whether the element is rendered once per array item, or only under a condition. */
function placement(element: Element, component: ComponentInfo): Pick<RenderLink, 'list' | 'when'> {
  const result: Pick<RenderLink, 'list' | 'when'> = {}
  let child: Node = element
  for (const ancestor of element.getAncestors()) {
    if (ancestor === component.fn) break
    if (Node.isBinaryExpression(ancestor) && ancestor.getOperatorToken().getText() === '&&' && ancestor.getRight() === child)
      result.when ??= ancestor.getLeft().getText()
    if (Node.isConditionalExpression(ancestor) && ancestor.getCondition() !== child) {
      const condition = ancestor.getCondition().getText()
      result.when ??= ancestor.getWhenTrue() === child ? condition : `!(${condition})`
    }
    if (isFn(ancestor)) {
      const call = ancestor.getParent()
      const callee = Node.isCallExpression(call) ? call.getExpression() : undefined
      if (callee && Node.isPropertyAccessExpression(callee) && /^(map|flatMap)$/.test(callee.getName())) result.list ??= { key: listKey(element, ancestor) }
    }
    child = ancestor
  }
  return result
}

/** `<CartContext.Provider value={…}>` (or `<CartContext value>` in React 19): who provides, and how stably. */
function readProvider(state: ReaderState, component: ComponentInfo, element: Element, context: string) {
  const node = state.contexts.get(context)
  if (!node || node.provider) return
  node.provider = component.id

  const value = element.getAttribute('value')
  const expression = value && attributeExpression(value)
  if (!expression) return
  const inner = unwrap(expression)
  const binding = resolve(state, component, inner)
  const freshEveryRender =
    Node.isObjectLiteralExpression(inner) ||
    Node.isArrayLiteralExpression(inner) ||
    (binding?.kind === 'value' && binding.unstable) ||
    (binding?.kind === 'data' && binding.fresh)
  if (freshEveryRender) node.stable = false
}

function readChild(state: ReaderState, component: ComponentInfo, element: Element, child: string) {
  if (!component.renders.some((link) => link.id === child)) component.renders.push({ id: child, ...placement(element, component) })
  for (const attribute of element.getAttributes()) {
    if (!Node.isJsxAttribute(attribute)) {
      state.notes.push(`${component.id} spreads props into ${child}; those props are missing.`)
      continue
    }
    const name = attribute.getNameNode().getText()
    if (name === 'key' || name === 'ref') continue
    state.usages.push({ parent: component.id, child, attr: name, expr: attributeExpression(attribute) })
  }
}

/** Third pass: what a component renders, what it passes down, and which contexts it provides. */
export function readJsx(state: ReaderState, component: ComponentInfo) {
  const elements = component.fn.getDescendants().filter((n): n is Element => Node.isJsxOpeningElement(n) || Node.isJsxSelfClosingElement(n))
  for (const element of elements) {
    const tag = element.getTagNameNode().getText()
    const context = tag.replace(/\.Provider$/, '')
    if (state.contexts.has(context)) readProvider(state, component, element, context)
    else if (state.components.has(tag)) readChild(state, component, element, tag)
    else
      for (const attribute of element.getAttributes()) {
        // DOM elements and third-party components are where callbacks get called from.
        const expression = attributeExpression(attribute)
        if (expression) component.domAttributes.push(expression)
      }
  }
}

/** Whether a node is the value of an attribute on a child component (as opposed to a DOM element). */
export function attributeOwner(state: ReaderState, node: Node): 'component' | 'dom' | null {
  const expression = node.getParent()
  const attribute = expression?.getParent()
  if (!expression || !Node.isJsxExpression(expression) || !attribute || !Node.isJsxAttribute(attribute)) return null
  const element = attribute.getParent()?.getParent()
  const tag = element && (Node.isJsxOpeningElement(element) || Node.isJsxSelfClosingElement(element)) ? element.getTagNameNode().getText() : ''
  return state.components.has(tag) ? 'component' : 'dom'
}
