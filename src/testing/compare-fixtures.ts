/** A small plan and the flow an AI might write from the code that came out of it. */
export const PLAN_YAML = `
version: 1
name: Cart plan
types:
  Item: { sku: string, qty: number }
  Cart: { items: "Item[]" }
nodes:
  - { id: App, kind: component, renders: [Header, CartPage] }
  - { id: Header, kind: component, props: { title: string } }
  - { id: CartPage, kind: component, renders: [CartList] }
  - { id: CartList, kind: component, memo: true }
  - { id: cart, kind: state, owner: CartPage, type: Cart }
  - { id: Planned, kind: component }
  - { id: sync, kind: effect, owner: CartPage, deps: [cart], sets: [] }
edges:
  - { kind: prop, from: App, to: Header, name: title }
  - { kind: reads, from: cart, to: CartList, fields: [items] }
  - { kind: writes, from: CartList, to: cart, via: setCart }
`

export const CODE_YAML = `
version: 1
name: Cart from code
types:
  Item: { sku: string, qty: number, price: number }
  Money: number
nodes:
  - { id: App, kind: component, renders: [Header, CartPage], source: "src/App.tsx:3" }
  - { id: Header, kind: component, props: { title: string, onSearch: "() => void" } }
  - { id: CartPage, kind: component, renders: [CartList, Total] }
  - { id: CartList, kind: component }
  - { id: cart, kind: state, owner: App, type: Cart }
  - { id: Total, kind: component }
  - { id: sync, kind: effect, owner: CartPage, deps: [cart], sets: [cart] }
edges:
  - { kind: prop, from: App, to: Header, name: title, stable: false }
  - { kind: prop, from: App, to: Header, name: onSearch, callback: true }
  - { kind: reads, from: cart, to: CartList }
  - { kind: mutates, from: CartList, to: cart, op: "cart.items.push(item)" }
`
