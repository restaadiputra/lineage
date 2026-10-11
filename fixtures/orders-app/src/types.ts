export interface Customer {
  id: string
  name: string
}

export interface Item {
  sku: string
  qty: number
  price: number
}

export interface Order {
  id: string
  customer: Customer
  status: 'draft' | 'paid' | 'shipped'
  items: Item[]
}

export interface Cart {
  items: Item[]
  count: number
  add: (item: Item) => void
}

export type UIState = {
  theme: 'light' | 'dark'
  sidebarOpen: boolean
}
