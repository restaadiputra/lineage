import type { Rect } from './edge-geometry'
import type { Size } from './node-size'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

/** Below this, 12–13px node text is too small to read (about 9px on screen). */
export const READABLE_ZOOM = 0.75

const PADDING = 24

/** The smallest rectangle around all the given ones; null when there are none. */
export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.width))
  const bottom = Math.max(...rects.map((r) => r.y + r.height))
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * The first view of a diagram: everything in view when that keeps text
 * readable, otherwise zoomed to a readable size and showing the top of the
 * diagram (the root components), centered sideways. A whole-diagram overview
 * of a large flow at 40% is one click away, but it is not a useful default.
 */
export function readableViewport(bounds: Rect, view: Size): Viewport {
  const room = { width: Math.max(1, view.width - 2 * PADDING), height: Math.max(1, view.height - 2 * PADDING) }
  const fitZoom = Math.min(1, room.width / bounds.width, room.height / bounds.height)
  const zoom = Math.max(fitZoom, READABLE_ZOOM)

  const centerX = bounds.x + bounds.width / 2
  const fitsVertically = bounds.height * zoom <= room.height
  return {
    zoom,
    x: view.width / 2 - centerX * zoom,
    y: fitsVertically ? view.height / 2 - (bounds.y + bounds.height / 2) * zoom : PADDING - bounds.y * zoom,
  }
}
