import { z } from 'zod'
import type { FileType } from './ports'
import type { Positions } from './position-repository'

/**
 * The `.flow.layout.json` file: canvas positions written next to a flow file
 * so a team shares one arrangement through the repo. The flow YAML itself
 * never holds positions.
 */
const LayoutFile = z.object({
  version: z.literal(1),
  /** name of the flow it was saved for; informational */
  flow: z.string(),
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
})
export type LayoutFile = z.infer<typeof LayoutFile>

export const LAYOUT_FILE_TYPE: FileType = {
  description: 'Lineage layout',
  mime: 'application/json',
  extensions: ['.json'],
}

/**
 * Positions as file text. Only nodes that exist are written, sorted by id and
 * rounded to whole pixels, so the file diffs cleanly in version control.
 */
export function serializeLayout(flowName: string, positions: Positions, nodeIds: string[]): string {
  const kept = [...nodeIds]
    .filter((id) => positions[id])
    .sort()
    .map((id) => [id, { x: Math.round(positions[id].x), y: Math.round(positions[id].y) }])
  const file: LayoutFile = { version: 1, flow: flowName, positions: Object.fromEntries(kept) }
  return JSON.stringify(file, null, 2) + '\n'
}

export type ParsedLayout = { ok: true; layout: LayoutFile } | { ok: false; error: string }

export function parseLayout(text: string): ParsedLayout {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'it is not valid JSON' }
  }
  const parsed = LayoutFile.safeParse(raw)
  if (parsed.success) return { ok: true, layout: parsed.data }
  const issue = parsed.error.issues[0]
  return { ok: false, error: `${issue.path.join('.') || 'file'}: ${issue.message}` }
}
