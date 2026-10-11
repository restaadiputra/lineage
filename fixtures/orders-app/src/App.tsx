import { useState } from 'react'
import { CartContext, useCart } from './cart/CartProvider'
import { Header } from './layout/Header'
import { OrdersPage } from './orders/OrdersPage'

export function App() {
  const [searchTerm, setSearchTerm] = useState<string>('')
  const cart = useCart()

  return (
    <CartContext.Provider value={{ items: cart.items, count: cart.items.length, add: cart.add }}>
      <Header search={searchTerm} onSearch={setSearchTerm} />
      <OrdersPage />
    </CartContext.Provider>
  )
}
