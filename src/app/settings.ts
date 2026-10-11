import { z } from 'zod'
import type { KeyValueStore } from './ports'

export const EDGE_GROUPS = ['tree', 'reads', 'writes', 'ownership'] as const
export type EdgeGroup = (typeof EDGE_GROUPS)[number]

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const PANEL_LIMITS = {
  editor: { min: 240, max: 720 },
  inspector: { min: 240, max: 520 },
} as const

/** UI preferences. Every field has a default so old or partial saves still load. */
const Settings = z.object({
  theme: z.enum(THEMES).default('system'),
  editorOpen: z.boolean().default(true),
  editorWidth: z.number().default(340),
  inspectorWidth: z.number().default(280),
  edgeFilters: z
    .object({
      tree: z.boolean().default(true),
      reads: z.boolean().default(true),
      writes: z.boolean().default(true),
      ownership: z.boolean().default(true),
    })
    .prefault({}),
})
export type Settings = z.infer<typeof Settings>

const KEY = 'lineage:settings'

export function loadSettings(storage: KeyValueStore): Settings {
  try {
    return Settings.parse(JSON.parse(storage.read(KEY) ?? '{}'))
  } catch {
    // A corrupt save is not worth an error screen: fall back to defaults.
    return Settings.parse({})
  }
}

export function saveSettings(storage: KeyValueStore, settings: Settings): void {
  storage.write(KEY, JSON.stringify(settings))
}
