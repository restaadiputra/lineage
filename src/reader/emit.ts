import { Document, isMap, isSeq } from 'yaml'
import { Node } from 'ts-morph'
import { attributeOwner } from './jsx'
import type { ComponentInfo, Out, ReaderState, Usage } from './model'
import { unwrap, valueOf } from './resolve'

/** Whether a child does more with a prop than hand it to its own children. */
function usesProp(state: ReaderState, child: ComponentInfo, prop: string): boolean {
  const locals = [...child.bindings].filter(([, binding]) => binding.kind === 'prop' && binding.name === prop).map(([name]) => name)
  const propsObjects = [...child.bindings].filter(([, binding]) => binding.kind === 'props').map(([name]) => name)

  const references = child.fn.getDescendants().filter((node) => {
    if (Node.isPropertyAccessExpression(node)) return node.getName() === prop && propsObjects.includes(node.getExpression().getText())
    if (!Node.isIdentifier(node) || !locals.includes(node.getText())) return false
    const parent = node.getParent()
    // Skip the declaration in the parameter list, `x.name` property names and `<Child name=…>` attribute names.
    if (Node.isBindingElement(parent) || Node.isJsxAttribute(parent)) return false
    return !(Node.isPropertyAccessExpression(parent) && parent.getNameNode() === node)
  })
  // Never mentioned: nothing says it is only forwarded, so leave the default.
  if (references.length === 0) return true
  return references.some((reference) => attributeOwner(state, reference) !== 'component')
}

function propEdge(state: ReaderState, usage: Usage): Out | null {
  const parent = state.components.get(usage.parent)
  const child = state.components.get(usage.child)
  if (!parent || !child) return null
  const value = valueOf(state, parent, usage.expr && unwrap(usage.expr))
  return {
    kind: 'prop',
    from: usage.parent,
    to: usage.child,
    name: usage.attr,
    ...(value.data ? { data: value.data } : {}),
    ...(usesProp(state, child, usage.attr) ? {} : { used: false }),
    ...(value.unstable ? { stable: false } : {}),
    ...(value.callback ? { callback: true } : {}),
  }
}

function componentNode(component: ComponentInfo): Out {
  const renders = component.renders.map((link) => (link.list || link.when ? link : link.id))
  return {
    id: component.id,
    kind: 'component',
    ...(component.memo ? { memo: true } : {}),
    ...(Object.keys(component.props).length ? { props: component.props } : {}),
    ...(renders.length ? { renders } : {}),
    source: component.source,
  }
}

/** The declared types the flow mentions, and the types those mention. */
function referencedTypes(state: ReaderState, nodes: Out[]): Record<string, string | Record<string, string>> {
  const found = new Map<string, string | Record<string, string>>()
  const visit = (text: string) => {
    for (const name of text.match(/[A-Za-z_$][\w$]*/g) ?? []) {
      const declaration = state.typeDeclarations.get(name)
      if (declaration === undefined || found.has(name)) continue
      found.set(name, declaration)
      for (const inner of typeof declaration === 'string' ? [declaration] : Object.values(declaration)) visit(inner)
    }
  }
  for (const node of nodes) {
    if (typeof node.type === 'string') visit(node.type)
    for (const type of Object.values((node.props as Record<string, string> | undefined) ?? {})) visit(type)
  }
  return Object.fromEntries(found)
}

/** Contexts are only valid with a provider; one that is never provided is reported instead. */
function contextNodes(state: ReaderState): Out[] {
  const provided: Out[] = []
  for (const node of state.contexts.values()) {
    // Rebuilt so the keys come out in the order FORMAT.md lists them, with `source` last.
    const { id, kind, provider, type, stable, source } = node
    if (provider) provided.push({ id, kind, provider, type, ...(stable === false ? { stable } : {}), source })
    else state.notes.push(`${String(node.id)} is created but the reader found no component that provides it; it was left out.`)
  }
  return provided
}

export interface FlowObject {
  version: 1
  name: string
  types: Record<string, string | Record<string, string>>
  nodes: Out[]
  edges: Out[]
}

/** Last pass: assemble the flow in the order a person would write it. */
export function assemble(state: ReaderState, name: string): FlowObject {
  const contexts = contextNodes(state)
  const known = new Set([...state.ids].filter((id) => !state.contexts.has(id)).concat(contexts.map((node) => String(node.id))))
  const nodes = [...[...state.components.values()].map(componentNode), ...contexts, ...state.nodes]
  const props = state.usages.map((usage) => propEdge(state, usage)).filter((edge): edge is Out => edge !== null)
  // An edge to a context that was left out would make the file invalid.
  const edges = [...props, ...state.edges].filter((edge) => known.has(String(edge.from)) && known.has(String(edge.to)))
  return { version: 1, name, types: referencedTypes(state, nodes), nodes, edges }
}

/** The flow as YAML: nodes in block style, edges one per line, as FORMAT.md writes them. */
export function toYaml(flow: FlowObject, notes: string[]): string {
  // The same props type object can be shared by several components; write it out each time, not as a YAML alias.
  const doc = new Document(flow, { aliasDuplicateObjects: false })
  const edges = doc.get('edges', true)
  if (isSeq(edges)) for (const edge of edges.items) if (isMap(edge)) edge.flow = true
  const header = [
    ' Read from source code by Lineage, without AI.',
    ' The reader recognises common React patterns by name; it does not run the code.',
    ...(notes.length ? [' Not read:', ...notes.map((note) => `  - ${note}`)] : []),
  ]
  doc.commentBefore = header.join('\n')
  return doc.toString({ lineWidth: 0 })
}
