import type { FitViewOptions } from '@xyflow/react'

/** Fit the diagram in view; animated only when the user allows motion. */
export function fitOptions(): FitViewOptions {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return { padding: 0.08, maxZoom: 1, duration: reduced ? 0 : 240 }
}
