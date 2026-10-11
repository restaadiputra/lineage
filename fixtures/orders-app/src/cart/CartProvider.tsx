import { createContext, useState } from 'react'
import type { Cart, Item } from '../types'

export const CartContext = createContext<Cart>({ items: [], count: 0, add: () => {} })

/** A custom hook: the code reader does not follow these, and says so. */
export function useCart() {
  const [items, setItems] = useState<Item[]>([])
  return { items, add: (item: Item) => setItems((previous) => [...previous, item]) }
}
