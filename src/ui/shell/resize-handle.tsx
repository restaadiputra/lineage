import { useState, type KeyboardEvent, type PointerEvent } from 'react'

interface ResizeHandleProps {
  label: string
  value: number
  min: number
  max: number
  /** 1 when dragging right grows the panel (left panel), -1 for a right panel */
  direction: 1 | -1
  onChange(value: number): void
}

const KEY_STEP = 16

/** Vertical separator that resizes the panel next to it, by pointer or arrow keys. */
export function ResizeHandle({ label, value, min, max, direction, onChange }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false)
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)))

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging) onChange(clamp(value + event.movementX * direction))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: KEY_STEP, ArrowLeft: -KEY_STEP }[event.key]
    if (!step) return
    event.preventDefault()
    onChange(clamp(value + step * direction))
  }

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-dragging={dragging}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={onKeyDown}
    />
  )
}
