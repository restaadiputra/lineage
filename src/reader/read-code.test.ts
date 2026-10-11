import { describe, expect, it } from 'vitest'
import { analyze } from '../app/analyze'
import { readCode } from './read-code'
import { isReadable, type SourceInput } from './source-files'

/** The fixture app: the orders dashboard as real React code, flaws included. */
const fixture = import.meta.glob('../../fixtures/orders-app/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const fixtureFiles: SourceInput[] = Object.entries(fixture).map(([path, text]) => ({ path: path.replace('../../fixtures/orders-app/', ''), text }))

function read(files: SourceInput[]) {
  const result = readCode(files, 'Test flow')
  const { valid, diagnostics } = analyze(result.yaml)
  if (!valid) throw new Error(`The reader wrote an invalid flow:\n${JSON.stringify(diagnostics, null, 2)}\n${result.yaml}`)
  return { ...result, ...valid }
}

/** Read one component file written inline. */
const readSource = (text: string, path = 'src/App.tsx') => read([{ path, text }])

describe('reading the orders fixture app', () => {
  const { flow, graph, problems, notes, yaml } = read(fixtureFiles)
  const node = (id: string) => graph.byId.get(id)
  const edges = (kind: string) => flow.edges.filter((e) => e.kind === kind)
  const edge = (kind: string, from: string, to: string, name?: string) =>
    flow.edges.find((e) => e.kind === kind && e.from === from && e.to === to && (!name || ('name' in e && e.name === name)))

  it('finds every component, however it is declared', () => {
    const components = flow.nodes.filter((n) => n.kind === 'component').map((n) => n.id)
    expect(components.sort()).toEqual(
      ['App', 'CartBadge', 'CheckoutButton', 'Header', 'Layout', 'OrderList', 'OrderRow', 'OrderSummary', 'OrdersPage', 'QtyStepper', 'SearchBox', 'Sidebar'].sort(),
    )
    expect(node('OrderList')).toMatchObject({ memo: true, source: 'src/orders/Layout.tsx:27' })
    expect(node('CartBadge')).toMatchObject({ kind: 'component', source: 'src/layout/Header.tsx:24' })
  })

  it('reads props from inline types and named interfaces', () => {
    expect(node('SearchBox')).toMatchObject({ props: { value: 'string', onChange: '(value: string) => void' } })
    expect(node('Sidebar')).toMatchObject({ props: { orders: 'Order[]', onSelect: '(id: string) => void' } })
  })

  it('reads the render tree, with lists and conditions', () => {
    expect(node('App')).toMatchObject({ renders: ['Header', 'OrdersPage'] })
    expect(node('OrderList')).toMatchObject({ renders: [{ id: 'OrderRow', list: { key: 'index' } }] })
    expect(node('OrderRow')).toMatchObject({ renders: [{ id: 'QtyStepper', list: { key: 'sku' } }] })
    expect(node('OrdersPage')).toMatchObject({ renders: ['Layout', 'OrderSummary', { id: 'CheckoutButton', when: 'orders.length > 0' }] })
  })

  it('finds state, with types from the generic or the initial value', () => {
    expect(node('searchTerm')).toMatchObject({ kind: 'state', owner: 'App', type: 'string' })
    expect(node('orders')).toMatchObject({ kind: 'state', owner: 'OrdersPage', type: 'Order[]', hook: 'useState' })
    expect(node('selectedId')).toMatchObject({ type: 'string | null' })
    expect(node('total')).toMatchObject({ type: 'number', source: 'src/orders/OrdersPage.tsx:11' })
  })

  it('finds the context, its provider, and that its value is rebuilt every render', () => {
    expect(node('CartContext')).toEqual({ id: 'CartContext', kind: 'context', provider: 'App', type: 'Cart', stable: false, source: 'src/cart/CartProvider.tsx:4' })
  })

  it('finds the store and the query', () => {
    expect(node('uiStore')).toMatchObject({ kind: 'store', library: 'zustand', type: 'UIState' })
    expect(node('ordersQuery')).toMatchObject({ kind: 'query', library: 'react-query', key: "['orders']", type: 'Order[]' })
  })

  it('records who reads what, and which fields', () => {
    expect(edges('reads')).toEqual(
      expect.arrayContaining([
        { kind: 'reads', from: 'uiStore', to: 'Header' },
        { kind: 'reads', from: 'CartContext', to: 'CartBadge', fields: ['count'] },
        { kind: 'reads', from: 'CartContext', to: 'CheckoutButton', fields: ['items'] },
        { kind: 'reads', from: 'CartContext', to: 'QtyStepper', fields: ['add'] },
        { kind: 'reads', from: 'ordersQuery', to: 'OrdersPage' },
      ]),
    )
    expect(edges('reads')).toHaveLength(5)
  })

  it('traces a prop back to its data through renames, props objects and map callbacks', () => {
    expect(edge('prop', 'App', 'Header', 'search')).toMatchObject({ data: 'searchTerm' })
    expect(edge('prop', 'Header', 'SearchBox', 'value')).toMatchObject({ data: 'searchTerm' })
    expect(edge('prop', 'Sidebar', 'OrderList', 'orders')).toMatchObject({ data: 'orders' })
    expect(edge('prop', 'OrderList', 'OrderRow', 'order')).toMatchObject({ data: 'orders[]' })
    expect(edge('prop', 'OrderRow', 'QtyStepper', 'item')).toMatchObject({ data: 'orders[].items[]' })
    expect(edge('prop', 'OrdersPage', 'OrderSummary', 'total')).toMatchObject({ data: 'total' })
  })

  it('marks props that are only passed on', () => {
    expect(edge('prop', 'App', 'Header', 'search')).toMatchObject({ used: false })
    expect(edge('prop', 'OrdersPage', 'Layout', 'orders')).toMatchObject({ used: false })
    expect(edge('prop', 'Layout', 'Sidebar', 'onSelect')).toMatchObject({ used: false })
    // The components at the end of the chain do use them.
    expect(edge('prop', 'Sidebar', 'OrderList', 'orders')).toMatchObject({ used: true })
    expect(edge('prop', 'OrderList', 'OrderRow', 'onSelect')).toMatchObject({ used: true })
  })

  it('marks callbacks, and the ones recreated on every render all the way down', () => {
    expect(edge('prop', 'OrdersPage', 'Layout', 'onSelect')).toMatchObject({ callback: true, stable: false })
    expect(edge('prop', 'Sidebar', 'OrderList', 'onSelect')).toMatchObject({ callback: true, stable: false })
    // A state setter is the same function every render.
    const setter = edge('prop', 'App', 'Header', 'onSearch')
    expect(setter).toMatchObject({ callback: true })
    expect(setter && 'stable' in setter ? setter.stable : undefined).toBeUndefined()
  })

  it('attributes a write to the component that triggers it, with the route', () => {
    expect(edges('writes')).toEqual([
      { kind: 'writes', from: 'SearchBox', to: 'searchTerm', via: 'onChange → setSearchTerm' },
      { kind: 'writes', from: 'OrderRow', to: 'selectedId', via: 'onSelect → setSelectedId' },
      { kind: 'writes', from: 'QtyStepper', to: 'CartContext', via: 'add' },
    ])
  })

  it('finds the mutation of data received through props', () => {
    expect(edges('mutates')).toEqual([{ kind: 'mutates', from: 'QtyStepper', to: 'orders', op: 'item.qty += 1', fields: ['[].items[].qty'] }])
  })

  it('reads effects: dependencies, what they set, and whether they reach outside React', () => {
    expect(node('syncOrders')).toMatchObject({ kind: 'effect', owner: 'OrdersPage', deps: ['ordersQuery'], sets: ['orders'] })
    expect(node('syncTotal')).toMatchObject({ kind: 'effect', owner: 'OrdersPage', deps: ['orders'], sets: ['total'] })
    expect(edges('derives')).toEqual([
      { kind: 'derives', from: 'ordersQuery', to: 'orders', via: 'syncOrders' },
      { kind: 'derives', from: 'orders', to: 'total', via: 'syncTotal' },
    ])
  })

  it('includes the types the flow mentions, and the types those mention', () => {
    expect(Object.keys(flow.types).sort()).toEqual(['Cart', 'Customer', 'Item', 'Order', 'UIState'])
    expect(flow.types.Order).toEqual({ id: 'string', customer: 'Customer', status: "'draft' | 'paid' | 'shipped'", items: 'Item[]' })
  })

  it('says what it did not follow', () => {
    expect(notes).toEqual(['App calls useCart(), a hook the reader does not follow; anything it holds is missing.'])
    expect(yaml).toContain('# Not read:\n#  - App calls useCart()')
  })

  it('produces a flow the rules can check, and they find the planted flaws', () => {
    const rules = new Set(problems.active.map((p) => p.rule))
    for (const rule of ['mutation', 'prop-drilling', 'server-state-copy', 'derived-state', 'effect-chain', 'unstable-memo-prop', 'busy-context', 'list-key'])
      expect(rules, rule).toContain(rule)
  })
})

describe('reading other ways of writing React', () => {
  it('reads useReducer and useRef as state', () => {
    const { graph, flow } = readSource(`
      export function Counter() {
        const [count, dispatch] = useReducer(reducer, 0)
        const input = useRef<HTMLInputElement>(null)
        return <button onClick={() => dispatch({ type: 'add' })}>{count}</button>
      }`)
    expect(graph.byId.get('count')).toMatchObject({ kind: 'state', hook: 'useReducer', owner: 'Counter' })
    expect(graph.byId.get('input')).toMatchObject({ kind: 'state', hook: 'useRef', type: 'HTMLInputElement' })
    expect(flow.edges).toEqual([{ kind: 'writes', from: 'Counter', to: 'count', via: 'dispatch' }])
  })

  it('keeps ids unique when two components use the same state name', () => {
    const { flow } = readSource(`
      export function A() { const [open, setOpen] = useState(false); return <B /> }
      function B() { const [open, setOpen] = useState(false); return <i>{String(open)}</i> }`)
    expect(flow.nodes.filter((n) => n.kind === 'state').map((n) => n.id)).toEqual(['open', 'B_open'])
  })

  it('reads a store selector as the field it picks', () => {
    const { flow } = readSource(`
      export const useCartStore = create<CartState>((set) => ({ items: [], add: () => set({}) }))
      export function Badge() {
        const items = useCartStore((s) => s.items)
        const add = useCartStore((s) => s.add)
        return <button onClick={() => add()}>{items.length}</button>
      }`)
    expect(flow.edges).toEqual([
      { kind: 'reads', from: 'cartStore', to: 'Badge', fields: ['items'] },
      { kind: 'reads', from: 'cartStore', to: 'Badge', fields: ['add'] },
      { kind: 'writes', from: 'Badge', to: 'cartStore', via: 'add' },
    ])
  })

  it('reads a destructured query and names it after its key', () => {
    const { graph, flow } = readSource(`
      export function Users() {
        const { data: users, isLoading } = useQuery({ queryKey: ['users', page], queryFn })
        return <List users={users} />
      }
      function List({ users }: { users: User[] }) { return <ul>{users.length}</ul> }`)
    expect(graph.byId.get('usersQuery')).toMatchObject({ kind: 'query', key: "['users', page]", type: 'unknown' })
    expect(flow.edges).toContainEqual({ kind: 'prop', from: 'Users', to: 'List', name: 'users', data: 'usersQuery', used: true })
  })

  it('tells a handler the component triggers from one it only hands down', () => {
    const { flow } = readSource(`
      export function Page() {
        const [value, setValue] = useState('')
        const reset = () => setValue('')
        const save = useCallback(() => setValue('saved'), [])
        return <div><button onClick={reset}>Reset</button><Form onSave={save} /></div>
      }
      function Form({ onSave }: { onSave: () => void }) { return <button onClick={onSave}>Save</button> }`)
    expect(flow.edges.filter((e) => e.kind === 'writes')).toEqual([
      { kind: 'writes', from: 'Page', to: 'value', via: 'setValue' },
      { kind: 'writes', from: 'Form', to: 'value', via: 'onSave → setValue' },
    ])
    // useCallback keeps the function stable, so the prop is not flagged.
    expect(flow.edges.find((e) => e.kind === 'prop')).toEqual({ kind: 'prop', from: 'Page', to: 'Form', name: 'onSave', used: true, callback: true })
  })

  it('does not call a copy a mutation', () => {
    const { flow } = readSource(`
      export function List() {
        const [rows, setRows] = useState<Row[]>([])
        const sorted = rows.slice().sort(byName)
        const again = rows.toSorted(byName)
        const bad = () => { rows.push(extra); rows[0].name = 'x' }
        return <ul onClick={bad}>{sorted.length + again.length}</ul>
      }`)
    expect(flow.edges.filter((e) => e.kind === 'mutates')).toEqual([
      { kind: 'mutates', from: 'List', to: 'rows', op: 'rows.push(extra)' },
      { kind: 'mutates', from: 'List', to: 'rows', op: "rows[0].name = 'x'", fields: ['[].name'] },
    ])
  })

  it('marks an effect that reaches outside React, and uses its name when it has one', () => {
    const { graph, flow } = readSource(`
      export function Clock() {
        const [now, setNow] = useState(0)
        useEffect(function tick() {
          const timer = setInterval(() => setNow(Date.now()), 1000)
          return () => clearInterval(timer)
        }, [])
        return <time>{now}</time>
      }`)
    expect(graph.byId.get('tick')).toMatchObject({ kind: 'effect', owner: 'Clock', deps: [], sets: ['now'], external: true })
    expect(flow.edges.filter((e) => e.kind === 'derives')).toEqual([])
  })

  it('leaves out a context nobody provides, and says so', () => {
    const { flow, notes } = readSource(`
      export const ThemeContext = createContext<Theme>(light)
      export function Button() { const theme = useContext(ThemeContext); return <b>{theme.name}</b> }`)
    expect(flow.nodes.map((n) => n.id)).toEqual(['Button'])
    expect(flow.edges).toEqual([])
    expect(notes).toEqual(['ThemeContext is created but the reader found no component that provides it; it was left out.'])
  })

  it('reads plain JavaScript too', () => {
    const { flow } = readSource(`export const App = () => { const [n, setN] = useState(0); return <button onClick={() => setN(n + 1)}>{n}</button> }`, 'src/App.jsx')
    expect(flow.nodes.map((n) => n.id)).toEqual(['App', 'n'])
  })

  it('returns an empty, valid flow when there are no components', () => {
    const result = readCode([{ path: 'src/util.ts', text: 'export const add = (a: number, b: number) => a + b' }], 'Nothing')
    expect(result.componentCount).toBe(0)
    expect(analyze(result.yaml).valid?.flow.nodes).toEqual([])
  })
})

describe('isReadable', () => {
  it('takes application source and skips tests, typings, dependencies and build output', () => {
    expect(['src/App.tsx', 'src/hooks/use-x.ts', 'app/page.jsx', 'lib/a.js'].every(isReadable)).toBe(true)
    for (const path of ['node_modules/react/index.js', 'src/App.test.tsx', 'src/a.spec.ts', 'src/types.d.ts', 'dist/app.js', 'README.md', '.next/server/x.js', 'src/Button.stories.tsx'])
      expect(isReadable(path), path).toBe(false)
  })
})
