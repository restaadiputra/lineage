import { memo, useContext } from 'react'
import { CartContext } from '../cart/CartProvider'
import type { Item, Order } from '../types'

interface ListProps {
  orders: Order[]
  onSelect: (id: string) => void
}

// Layout and Sidebar only pass the props on: prop drilling.
export function Layout({ orders, onSelect }: ListProps) {
  return (
    <div className="layout">
      <Sidebar orders={orders} onSelect={onSelect} />
    </div>
  )
}

function Sidebar(props: ListProps) {
  return (
    <aside>
      <OrderList orders={props.orders} onSelect={props.onSelect} />
    </aside>
  )
}

export const OrderList = memo(function OrderList({ orders, onSelect }: ListProps) {
  return (
    <ul>
      {orders.map((order, index) => (
        <OrderRow key={index} order={order} onSelect={onSelect} />
      ))}
    </ul>
  )
})

function OrderRow({ order, onSelect }: { order: Order; onSelect: (id: string) => void }) {
  return (
    <li onClick={() => onSelect(order.id)}>
      {order.customer.name}
      {order.items.map((item) => (
        <QtyStepper key={item.sku} item={item} />
      ))}
    </li>
  )
}

function QtyStepper({ item }: { item: Item }) {
  const { add } = useContext(CartContext)
  const increase = () => {
    // Mutation in place: React will not see this change.
    item.qty += 1
    add(item)
  }
  return <button onClick={increase}>{item.qty}</button>
}
