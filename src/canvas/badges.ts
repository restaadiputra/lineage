import type { Problem, Severity } from '../analysis/rules'

export interface Badge {
  count: number
  /** the worst severity among the node's problems */
  severity: Severity
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

/** Problem count per node. A problem is pinned to the first node it names. */
export function problemBadges(problems: Problem[]): Map<string, Badge> {
  const badges = new Map<string, Badge>()
  for (const { nodes, severity } of problems) {
    const id = nodes[0]
    if (!id) continue
    const badge = badges.get(id)
    if (!badge) badges.set(id, { count: 1, severity })
    else {
      badge.count += 1
      if (RANK[severity] < RANK[badge.severity]) badge.severity = severity
    }
  }
  return badges
}
