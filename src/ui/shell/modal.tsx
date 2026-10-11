import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose(): void
  /** accessible name of the dialog */
  label: string
  className?: string
  children: ReactNode
}

/**
 * A native modal dialog: the browser traps focus inside it, closes it on Esc
 * and restores focus afterwards. Children are mounted only while it is open,
 * so every opening starts with fresh state.
 */
export function Modal({ open, onClose, label, className = '', children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      // The browser focuses the first control. A form can name a better start with data-autofocus.
      element.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className={`dialog ${className}`}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === dialog.current) onClose()
      }}
    >
      {open && children}
    </dialog>
  )
}
