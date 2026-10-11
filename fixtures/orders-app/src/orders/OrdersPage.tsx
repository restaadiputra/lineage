import { useQuery } from '@tanstack/react-query'
import { useContext, useEffect, useState } from 'react'
import { CartContext } from '../cart/CartProvider'
import type { Order } from '../types'
import { Layout } from './Layout'

export function OrdersPage() {
  const ordersQuery = useQuery<Order[]>({ queryKey: ['orders'], queryFn: () => fetch('/api/orders').then((r) => r.json()) })
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  // Server data copied into state: the diagram should flag this.
  useEffect(() => {
    if (ordersQuery.data) setOrders(ordersQuery.data)
  }, [ordersQuery.data])

  // A total that could be computed during render.
  useEffect(() => {
    setTotal(orders.flatMap((order) => order.items).reduce((sum, item) => sum + item.qty * item.price, 0))
  }, [orders])

  return (
    <main data-selected={selectedId}>
      <Layout orders={orders} onSelect={(id: string) => setSelectedId(id)} />
      <OrderSummary total={total} />
      {orders.length > 0 && <CheckoutButton />}
    </main>
  )
}

function OrderSummary({ total }: { total: number }) {
  return <p>Total: {total}</p>
}

function CheckoutButton() {
  const { items } = useContext(CartContext)
  return <button disabled={items.length === 0}>Check out</button>
}
