import { z } from 'zod'

/**
 * Lineage flow file format, version 1.
 * Keep docs/FORMAT.md in sync with this file — it is what the AI reads.
 */

const Id = z
  .string()
  .regex(/^[A-Za-z_$][\w$-]*$/, 'Ids are identifiers: letters, digits, _ $ - (no dots or spaces)')

/** A data path: "<dataNodeId>[.field][[]]…", e.g. "orders", "orders[]", "orders[].items" */
const DataPath = z
  .string()
  .regex(/^[A-Za-z_$][\w$-]*(\[\])*(\.[A-Za-z_$][\w$]*(\[\])*)*$/, 'Paths look like orders, orders[] or orders[].items')

/** A field path relative to a data node: "items", "items[].qty", "status" */
const FieldPath = z
  .string()
  .regex(
    /^(?=.)(\[\])*([A-Za-z_$][\w$]*(\[\])*)?(\.[A-Za-z_$][\w$]*(\[\])*)*$/,
    'Field paths look like status, items[].qty or [].status',
  )

const Updates = z.enum(['often', 'sometimes', 'rarely'])

const common = {
  id: Id,
  source: z.string().optional(),
  note: z.string().optional(),
}

const RenderChild = z.union([
  Id,
  z.object({
    id: Id,
    list: z.object({ key: z.string() }).optional(),
    when: z.string().optional(),
  }),
])

export const ComponentNode = z.object({
  ...common,
  kind: z.literal('component'),
  memo: z.boolean().optional(),
  props: z.record(z.string(), z.string()).optional(),
  renders: z.array(RenderChild).optional(),
})

export const StateNode = z.object({
  ...common,
  kind: z.literal('state'),
  owner: Id,
  hook: z.enum(['useState', 'useReducer', 'useRef']).default('useState'),
  type: z.string(),
  updates: Updates.optional(),
})

export const ContextNode = z.object({
  ...common,
  kind: z.literal('context'),
  provider: Id,
  type: z.string(),
  stable: z.boolean().optional(),
  updates: Updates.optional(),
})

export const StoreNode = z.object({
  ...common,
  kind: z.literal('store'),
  library: z.enum(['zustand', 'redux', 'jotai', 'mobx', 'other']).default('other'),
  type: z.string(),
  updates: Updates.optional(),
})

export const QueryNode = z.object({
  ...common,
  kind: z.literal('query'),
  library: z.enum(['react-query', 'swr', 'rtk-query', 'apollo', 'other']).default('other'),
  key: z.string().optional(),
  type: z.string(),
  updates: Updates.optional(),
})

export const EffectNode = z.object({
  ...common,
  kind: z.literal('effect'),
  owner: Id,
  deps: z.array(DataPath).default([]),
  sets: z.array(DataPath).default([]),
  external: z.boolean().optional(),
})

export const FlowNode = z.discriminatedUnion('kind', [
  ComponentNode,
  StateNode,
  ContextNode,
  StoreNode,
  QueryNode,
  EffectNode,
])

export const ReadsEdge = z.object({
  kind: z.literal('reads'),
  from: Id,
  to: Id,
  fields: z.array(FieldPath).optional(),
  as: z.string().optional(),
})

export const PropEdge = z.object({
  kind: z.literal('prop'),
  from: Id,
  to: Id,
  name: z.string(),
  data: DataPath.optional(),
  used: z.boolean().default(true),
  stable: z.boolean().optional(),
  callback: z.boolean().optional(),
})

export const WritesEdge = z.object({
  kind: z.literal('writes'),
  from: Id,
  to: Id,
  via: z.string().optional(),
  fields: z.array(FieldPath).optional(),
})

export const MutatesEdge = z.object({
  kind: z.literal('mutates'),
  from: Id,
  to: Id,
  op: z.string().optional(),
  fields: z.array(FieldPath).optional(),
})

export const DerivesEdge = z.object({
  kind: z.literal('derives'),
  from: Id,
  to: Id,
  via: z.string().optional(),
})

export const FlowEdge = z.discriminatedUnion('kind', [
  ReadsEdge,
  PropEdge,
  WritesEdge,
  MutatesEdge,
  DerivesEdge,
])

const TypeDef = z.union([z.string(), z.record(z.string(), z.string())])

export const IgnoreEntry = z.object({
  rule: z.string(),
  node: Id.optional(),
  reason: z.string(),
})

export const FlowFile = z.object({
  version: z.literal(1),
  name: z.string().default('Untitled flow'),
  types: z.record(z.string(), TypeDef).default({}),
  nodes: z.array(FlowNode).default([]),
  edges: z.array(FlowEdge).default([]),
  ignore: z.array(IgnoreEntry).default([]),
})

export type FlowFile = z.infer<typeof FlowFile>
export type FlowNode = z.infer<typeof FlowNode>
export type FlowEdge = z.infer<typeof FlowEdge>
export type ComponentNode = z.infer<typeof ComponentNode>
export type StateNode = z.infer<typeof StateNode>
export type ContextNode = z.infer<typeof ContextNode>
export type StoreNode = z.infer<typeof StoreNode>
export type QueryNode = z.infer<typeof QueryNode>
export type EffectNode = z.infer<typeof EffectNode>
export type PropEdge = z.infer<typeof PropEdge>
export type ReadsEdge = z.infer<typeof ReadsEdge>
export type IgnoreEntry = z.infer<typeof IgnoreEntry>

export type DataNode = StateNode | ContextNode | StoreNode | QueryNode
export const DATA_KINDS = ['state', 'context', 'store', 'query'] as const
export const isDataNode = (n: FlowNode | undefined): n is DataNode =>
  !!n && (DATA_KINDS as readonly string[]).includes(n.kind)
