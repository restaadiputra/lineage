import type { ComponentNode, DataNode, FlowNode } from '../model/schema'

export interface Size {
  width: number
  height: number
}

export const MAX_PROPS = 6

/**
 * Sizes are estimated from text length rather than measured in the DOM, so the
 * layout can run before anything is rendered and gives the same result every
 * time. The numbers match canvas.css.
 */
const SANS_CHAR = 7.4 // 13px Instrument Sans, weight 600
const MONO_CHAR = 7.25 // 12px JetBrains Mono
const SMALL_CHAR = 6.4 // 12px Instrument Sans
const PADDING_X = 24
const MIN_WIDTH = 112
const MAX_WIDTH = 264

export const COMPONENT_HEADER = 32
export const PROP_ROW = 18
export const DATA_HEIGHT = 48
export const EFFECT_HEIGHT = 26

const clampWidth = (content: number) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, content + PADDING_X)))

/** The props a component node lists, and how many more it has. */
export function visibleProps(node: ComponentNode): { shown: [name: string, type: string][]; hidden: number } {
  const all = Object.entries(node.props ?? {})
  return { shown: all.slice(0, MAX_PROPS), hidden: Math.max(0, all.length - MAX_PROPS) }
}

/** The muted word that names what a data node is in code. */
export function kindWord(node: DataNode): string {
  switch (node.kind) {
    case 'state':
      return node.hook
    case 'context':
      return 'context'
    case 'store':
      return node.library === 'other' ? 'store' : node.library
    case 'query':
      return node.library === 'other' ? 'query' : node.library
  }
}

function componentSize(node: ComponentNode): Size {
  const { shown, hidden } = visibleProps(node)
  const rows = shown.length + (hidden ? 1 : 0)
  const header = node.id.length * SANS_CHAR + (node.memo ? 44 : 0)
  const widest = Math.max(header, ...shown.map(([name, type]) => (name.length + type.length + 2) * MONO_CHAR))
  return { width: clampWidth(widest), height: COMPONENT_HEADER + (rows ? rows * PROP_ROW + 8 : 0) }
}

function dataSize(node: DataNode): Size {
  const header = node.id.length * SANS_CHAR + 10 + kindWord(node).length * SMALL_CHAR
  // Capsules lose usable width to their round ends.
  const inset = node.kind === 'state' || node.kind === 'context' ? 12 : 0
  return { width: clampWidth(Math.max(header, node.type.length * MONO_CHAR) + inset), height: DATA_HEIGHT }
}

export function sizeOf(node: FlowNode): Size {
  if (node.kind === 'component') return componentSize(node)
  if (node.kind === 'effect')
    return { width: Math.round(node.id.length * SMALL_CHAR + 'effect'.length * SMALL_CHAR + 28), height: EFFECT_HEIGHT }
  return dataSize(node)
}
