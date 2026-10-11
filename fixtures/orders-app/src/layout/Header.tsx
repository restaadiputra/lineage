import { useContext } from 'react'
import { CartContext } from '../cart/CartProvider'
import { useUiStore } from '../stores/ui'

interface HeaderProps {
  search: string
  onSearch: (value: string) => void
}

export function Header({ search, onSearch }: HeaderProps) {
  const ui = useUiStore()
  return (
    <header className={ui.theme}>
      <SearchBox value={search} onChange={onSearch} />
      <CartBadge />
    </header>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} />
}

const CartBadge = () => {
  const { count } = useContext(CartContext)
  return <span>{count}</span>
}
