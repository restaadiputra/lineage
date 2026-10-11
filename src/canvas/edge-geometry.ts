export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Anchor {
  x: number
  y: number
  side: Side
}

const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })

/** The point where the line from the center of `rect` towards `to` leaves the rectangle. */
export function anchorToward(rect: Rect, to: { x: number; y: number }): Anchor {
  const c = center(rect)
  const dx = to.x - c.x
  const dy = to.y - c.y
  if (dx === 0 && dy === 0) return { x: c.x, y: rect.y + rect.height, side: 'bottom' }

  // Compare the direction with the rectangle's diagonal to find the side it crosses.
  const crossesSide = Math.abs(dx) * rect.height > Math.abs(dy) * rect.width
  if (crossesSide) {
    const x = dx > 0 ? rect.x + rect.width : rect.x
    return { x, y: c.y + (dy * (rect.width / 2)) / Math.abs(dx), side: dx > 0 ? 'right' : 'left' }
  }
  const y = dy > 0 ? rect.y + rect.height : rect.y
  return { x: c.x + (dx * (rect.height / 2)) / Math.abs(dy), y, side: dy > 0 ? 'bottom' : 'top' }
}

/** Slide an anchor along its side, e.g. to keep a write apart from a read between the same nodes. */
export function shiftAlongSide(anchor: Anchor, distance: number): Anchor {
  const vertical = anchor.side === 'left' || anchor.side === 'right'
  return vertical ? { ...anchor, y: anchor.y + distance } : { ...anchor, x: anchor.x + distance }
}

/** Where an edge between two nodes starts and ends: on each border, facing the other node. */
export function connect(source: Rect, target: Rect): { from: Anchor; to: Anchor } {
  return { from: anchorToward(source, center(target)), to: anchorToward(target, center(source)) }
}

const ARROW_LENGTH = 7
const ARROW_HALF_WIDTH = 3.5

/** SVG path of an arrowhead whose tip sits on `anchor`, pointing into the node. */
export function arrowPath({ x, y, side }: Anchor): string {
  const l = ARROW_LENGTH
  const w = ARROW_HALF_WIDTH
  switch (side) {
    case 'top':
      return `M${x},${y} l${-w},${-l} h${2 * w} z`
    case 'bottom':
      return `M${x},${y} l${-w},${l} h${2 * w} z`
    case 'left':
      return `M${x},${y} l${-l},${-w} v${2 * w} z`
    case 'right':
      return `M${x},${y} l${l},${-w} v${2 * w} z`
  }
}
