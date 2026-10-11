import type { Graph } from '../model/graph'
import type { FlowNode } from '../model/schema'
import { appendToNodeList, appendToTopLevelList } from './yaml-list'

/** One change to a flow, made from the canvas and written into the YAML. */
export type FlowEdit =
  | { type: 'node'; node: Record<string, unknown> }
  | { type: 'edge'; edge: Record<string, unknown> }
  /** add to a list inside a node: a child to `renders`, a data path to `deps` or `sets` */
  | { type: 'list'; nodeId: string; list: 'renders' | 'deps' | 'sets'; value: string }

function applyEdit(yamlText: string, edit: FlowEdit): string {
  switch (edit.type) {
    case 'node':
      return appendToTopLevelList(yamlText, 'nodes', edit.node)
    case 'edge':
      return appendToTopLevelList(yamlText, 'edges', edit.edge)
    case 'list':
      return appendToNodeList(yamlText, edit.nodeId, edit.list, edit.value)
  }
}

/** The YAML with the edits applied in order. */
export const applyEdits = (yamlText: string, edits: FlowEdit[]): string => edits.reduce(applyEdit, yamlText)

export type NodeKind = FlowNode['kind']

/** What the Add node form collects. Which fields matter depends on the kind. */
export interface NodeDraft {
  kind: NodeKind
  id: string
  /** owning component (state, effect) or provider (context) */
  owner: string
  /** TypeScript type of the data */
  type: string
  /** for a component: the parent that renders it, or '' for none */
  renderedBy: string
}

/** Which of the optional draft fields each kind needs. */
export const NODE_FIELDS: Record<NodeKind, { owner: boolean; type: boolean; renderedBy: boolean }> = {
  component: { owner: false, type: false, renderedBy: true },
  state: { owner: true, type: true, renderedBy: false },
  context: { owner: true, type: true, renderedBy: false },
  store: { owner: false, type: true, renderedBy: false },
  query: { owner: false, type: true, renderedBy: false },
  effect: { owner: true, type: false, renderedBy: false },
}

const ID = /^[A-Za-z_$][\w$-]*$/

const isComponent = (graph: Graph, id: string) => graph.byId.get(id)?.kind === 'component'

/** The first thing wrong with a draft, in words for the form; null when it can be added. */
export function draftProblem(draft: NodeDraft, graph: Graph): string | null {
  const id = draft.id.trim()
  const fields = NODE_FIELDS[draft.kind]
  if (!id) return 'Give it an id.'
  if (!ID.test(id)) return 'Ids are identifiers: letters, digits, _ $ and -, with no spaces or dots.'
  if (graph.byId.has(id)) return `There is already a node called ${id}.`
  if (fields.owner && !isComponent(graph, draft.owner))
    return draft.kind === 'context' ? 'Choose the component that provides it.' : 'Choose the component that owns it.'
  if (fields.type && !draft.type.trim()) return 'Give it a type, for example string or Order[].'
  return null
}

/** The edits that add a valid draft: the node, and its parent's render link for a component. */
export function editsForNewNode(draft: NodeDraft): FlowEdit[] {
  const id = draft.id.trim()
  const fields = NODE_FIELDS[draft.kind]
  // Key order follows FORMAT.md: id, kind, who holds it, then its type.
  const node: Record<string, unknown> = { id, kind: draft.kind }
  if (fields.owner) node[draft.kind === 'context' ? 'provider' : 'owner'] = draft.owner
  if (fields.type) node.type = draft.type.trim()

  const edits: FlowEdit[] = [{ type: 'node', node }]
  if (fields.renderedBy && draft.renderedBy) edits.push({ type: 'list', nodeId: draft.renderedBy, list: 'renders', value: id })
  return edits
}
