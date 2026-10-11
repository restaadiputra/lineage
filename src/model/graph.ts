import type { ComponentNode, EffectNode, FlowEdge, FlowFile, FlowNode, PropEdge } from './schema'
import { isDataNode } from './schema'

export interface RenderLink {
  parent: string
  child: string
  listKey?: string
  isList: boolean
  when?: string
}

/** Pre-computed lookups over a flow file. Built once per parse. */
export interface Graph {
  flow: FlowFile
  byId: Map<string, FlowNode>
  children: Map<string, RenderLink[]>
  parents: Map<string, string[]>
  /** prop edges keyed by `${parent}>${child}` */
  propsBetween: Map<string, PropEdge[]>
  propsInto: Map<string, PropEdge[]>
  propsOutOf: Map<string, PropEdge[]>
  edgesFrom: Map<string, FlowEdge[]>
  edgesTo: Map<string, FlowEdge[]>
  effects: EffectNode[]
  /** data node id → owning/providing component */
  ownerOf: Map<string, string>
  roots: string[]
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const arr = m.get(k)
  if (arr) arr.push(v)
  else m.set(k, [v])
}

export function buildGraph(flow: FlowFile): Graph {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  const children = new Map<string, RenderLink[]>()
  const parents = new Map<string, string[]>()
  const propsBetween = new Map<string, PropEdge[]>()
  const propsInto = new Map<string, PropEdge[]>()
  const propsOutOf = new Map<string, PropEdge[]>()
  const edgesFrom = new Map<string, FlowEdge[]>()
  const edgesTo = new Map<string, FlowEdge[]>()
  const ownerOf = new Map<string, string>()
  const effects: EffectNode[] = []

  for (const n of flow.nodes) {
    if (n.kind === 'component') {
      for (const r of n.renders ?? []) {
        const link: RenderLink =
          typeof r === 'string'
            ? { parent: n.id, child: r, isList: false }
            : { parent: n.id, child: r.id, isList: !!r.list, listKey: r.list?.key, when: r.when }
        push(children, n.id, link)
        push(parents, link.child, n.id)
      }
    }
    if (n.kind === 'state') ownerOf.set(n.id, n.owner)
    if (n.kind === 'context') ownerOf.set(n.id, n.provider)
    if (n.kind === 'effect') effects.push(n)
  }

  for (const e of flow.edges) {
    push(edgesFrom, e.from, e)
    push(edgesTo, e.to, e)
    if (e.kind === 'prop') {
      push(propsBetween, `${e.from}>${e.to}`, e)
      push(propsInto, e.to, e)
      push(propsOutOf, e.from, e)
    }
  }

  const roots = flow.nodes
    .filter((n): n is ComponentNode => n.kind === 'component')
    .filter((n) => !parents.has(n.id))
    .map((n) => n.id)

  return { flow, byId, children, parents, propsBetween, propsInto, propsOutOf, edgesFrom, edgesTo, effects, ownerOf, roots }
}

export const dataNodes = (g: Graph) => g.flow.nodes.filter(isDataNode)

/** Ancestors of a component, nearest first (follows first parent). */
export function ancestors(g: Graph, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  let cur = g.parents.get(id)?.[0]
  while (cur && !seen.has(cur)) {
    out.push(cur)
    seen.add(cur)
    cur = g.parents.get(cur)?.[0]
  }
  return out
}

export function isDescendant(g: Graph, id: string, of: string): boolean {
  return ancestors(g, id).includes(of)
}

/** Lowest common ancestor in the render tree (a node counts as its own ancestor). */
export function lowestCommonAncestor(g: Graph, ids: string[]): string | undefined {
  if (ids.length === 0) return undefined
  let common = [ids[0], ...ancestors(g, ids[0])]
  for (const id of ids.slice(1)) {
    const chain = new Set([id, ...ancestors(g, id)])
    common = common.filter((c) => chain.has(c))
  }
  return common[0]
}

export const edgeKey = (e: { kind: string; from: string; to: string; name?: string }) =>
  `${e.kind}:${e.from}>${e.to}${e.name ? ':' + e.name : ''}`
