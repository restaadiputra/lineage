import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export interface MenuItem {
  label: string
  onSelect(): void
}

/** Moves focus between menu items with the arrow keys, Home and End. */
function moveFocus(list: HTMLElement, key: string): boolean {
  const items = [...list.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const current = items.indexOf(document.activeElement as HTMLElement)
  const target = {
    ArrowDown: (current + 1) % items.length,
    ArrowUp: (current - 1 + items.length) % items.length,
    Home: 0,
    End: items.length - 1,
  }[key]
  if (target === undefined) return false
  items[target]?.focus()
  return true
}

/** A button that opens a short list of actions below it. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const closeOnOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [open])

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) root.current?.querySelector('button')?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      close(true)
    } else if (moveFocus(event.currentTarget, event.key)) event.preventDefault()
  }

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {label}
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div className="menu__list" role="menu" id={id} ref={list} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="menu__item"
              onClick={() => {
                close(true)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
