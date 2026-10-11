# Lineage flow format (version 1)

A `.flow.yaml` file describes how data moves through a React feature: which
components render which, where state lives, who reads it, who changes it, and
what shape it has. Lineage draws the diagram and checks it against React rules.

You (the AI) will either **write this file from existing code** or **write code
from this file**. Follow the format exactly. Do not invent fields.

## Top level

```yaml
version: 1            # always 1
name: Orders page     # short human name
types: {}             # data shapes (see Types)
nodes: []             # components, state, context, stores, queries, effects
edges: []             # how data flows between them
ignore: []            # rule warnings the team has accepted (leave as is)
```

## Ids and paths

- Every node has a unique `id`. Use the component name for components
  (`OrderList`) and the variable name for data (`orders`, `CartContext`,
  `useCartStore` → `cartStore`). Ids may contain letters, digits, `_`, `$`, `-`.
- A **data path** starts with a data node id and walks into its type:
  `orders` (the array), `orders[]` (one order), `orders[].items[].qty`.
  `[]` means "an element of this array".
- A **field path** is the same thing without the node id, relative to the node:
  `status`, `items[].qty`, or `[].status` when the node itself is an array.

## Types

Describe the shapes that flow through the feature. Keys are type names, values
are either an object of `field: type` or a single type string (an alias).
Use TypeScript type syntax in strings. Quote strings containing `|`, `:`, `[`,
`{` or `=>`.

```yaml
types:
  Order:
    id: string
    status: "'draft' | 'paid'"
    items: Item[]
  Item: { sku: string, qty: number }
  OrderId: string
```

## Nodes

All nodes accept optional `source: path/to/file.tsx:line` and `note: text`.
**Always fill `source` when writing from code** so a human can verify you.

### component
```yaml
- id: OrderList
  kind: component
  memo: true                       # wrapped in React.memo (omit if not)
  props: { orders: "Order[]", onSelect: "(id: string) => void" }
  renders:                          # direct child components, in JSX order
    - OrderRow                      # plain child
    - { id: OrderRow, list: { key: id } }      # rendered in .map(); key is the field used, "index", or "none"
    - { id: EmptyState, when: "orders.length === 0" }   # conditional
```

### state — `useState` / `useReducer` / `useRef` inside a component
```yaml
- id: orders
  kind: state
  owner: OrdersPage                # component that calls the hook
  hook: useState                   # useState | useReducer | useRef
  type: Order[]
  updates: often                   # optional: often | sometimes | rarely
```
State inside a **custom hook** belongs to the component that calls the hook.
Mention the hook in `note` (e.g. `note: via useOrders()`).

### context
```yaml
- id: CartContext
  kind: context
  provider: App                    # component that renders <CartContext.Provider>
  type: Cart
  stable: false                    # false if the value object/array is created on every render (not memoized)
  updates: often
```

### store — Zustand, Redux, Jotai, MobX, other
```yaml
- id: cartStore
  kind: store
  library: zustand                 # zustand | redux | jotai | mobx | other
  type: CartState
```

### query — server data (React Query, SWR, RTK Query, Apollo)
```yaml
- id: ordersQuery
  kind: query
  library: react-query             # react-query | swr | rtk-query | apollo | other
  key: "['orders', page]"
  type: Order[]
```

### effect — `useEffect` / `useLayoutEffect`
```yaml
- id: syncOrders                   # name it after what it does
  kind: effect
  owner: OrdersPage
  deps: [ordersQuery]              # data paths in the dependency array
  sets: [orders]                   # data paths whose setters it calls
  external: false                  # true if it talks to something outside React (fetch, subscription, DOM, timer, storage)
```

## Edges

### reads — a component reads data directly (not through props)
Context via `useContext`, store via a selector/hook, query via its hook, and a
component reading its **own** state.
```yaml
- { kind: reads, from: cartStore, to: CartBadge, fields: [count] }
```
`fields` lists what the selector picks. Omit `fields` only when the component
subscribes to the whole value (e.g. `useStore()` with no selector).

### prop — a parent passes a prop to a child
```yaml
- { kind: prop, from: OrdersPage, to: OrderList, name: orders, data: orders }
- { kind: prop, from: OrderList, to: OrderRow, name: order, data: "orders[]" }
- { kind: prop, from: OrdersPage, to: OrderList, name: onSelect, callback: true, stable: false }
```
- `data`: the **original** data path this prop carries, traced back to its
  source node — even after renaming. Omit for callbacks and constants.
- `used: false` when the child only forwards the prop to its own children and
  never reads it otherwise. Default is `true`.
- `stable: false` when the value is a new object, array or function on every
  render of the parent (inline `{}`, `[]`, arrow function, `.map()` result, not
  wrapped in `useMemo`/`useCallback`). `stable: true` when memoized or a
  primitive. Omit if unsure.
- `callback: true` for function props.
- One edge per prop. The parent must list the child in `renders`.

### writes — something changes data through its setter or action
```yaml
- { kind: writes, from: OrderRow, to: selectedId, via: "onSelect → setSelectedId" }
- { kind: writes, from: CartButton, to: cartStore, via: addItem, fields: [items] }
```
Point `from` at the component (or effect) where the change is triggered, even
if it goes through callback props. Describe the route in `via`.

### mutates — data changed in place (`push`, `splice`, `obj.x = …`, `sort()` on state)
```yaml
- { kind: mutates, from: QtyStepper, to: orders, op: "item.qty += 1", fields: ["[].items[].qty"] }
```
Only record this when the code really mutates. Immutable updates are `writes`.

### derives — data computed or copied from other data and **stored**
```yaml
- { kind: derives, from: orders, to: total, via: computeTotal }
```
Use it when a state/store value is computed from, or copied from, another data
node (usually in an effect or event handler). Values computed during render
(`const total = sum(orders)` or `useMemo`) are not nodes at all.

## Writing this file from code (code → diagram)

1. Start at the entry component the user names. Walk JSX children recursively.
2. For each component: add a `component` node with `props` (from its prop
   type), `memo`, `renders`, and `source`.
3. For each `useState`/`useReducer`/`useRef`, context, store, query and effect:
   add the node with `owner`/`provider` and `type`.
4. For each JSX prop passed to a child component: add a `prop` edge; trace
   `data` to the original source; decide `used` and `stable`.
5. Add `reads`, `writes`, `mutates` and `derives` edges.
6. Add every type you referenced to `types`, with fields.
7. Skip DOM elements, styling-only components and third-party UI primitives
   unless data flows through them.
8. If something is unclear, still emit valid YAML and explain it in `note`.
   Never guess a `source` line.

Output only the YAML file.

## Writing code from this file (diagram → code)

- Create one component per `component` node, with exactly the listed props and
  types. Wrap in `React.memo` only when `memo: true`.
- Put each state in its `owner`; each context provider in its `provider`.
- Pass props exactly as the `prop` edges say. Memoize values with
  `stable: true` (`useMemo` / `useCallback`).
- Implement `writes` with immutable updates. Never mutate.
- Keep anything the diagram does not store as derived during render.
- If the diagram and a React rule disagree, follow the rule and tell the user.
