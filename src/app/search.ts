import type { FlowNode } from '../model/schema'

/** Lower is better; null means no match. */
function score(id: string, query: string): number | null {
  if (id === query) return 0
  if (id.startsWith(query)) return 1
  if (id.includes(query)) return 2
  // Letters in order with gaps: "olst" finds OrderList.
  let at = 0
  for (const char of query) {
    at = id.indexOf(char, at) + 1
    if (at === 0) return null
  }
  return 3
}

/** Nodes whose id matches the query, best first. An empty query lists nodes in file order. */
export function searchNodes(nodes: FlowNode[], query: string, limit = 8): FlowNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes.slice(0, limit)
  return nodes
    .map((node, index) => ({ node, index, rank: score(node.id.toLowerCase(), needle) }))
    .filter((hit): hit is typeof hit & { rank: number } => hit.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.node.id.length - b.node.id.length || a.index - b.index)
    .slice(0, limit)
    .map((hit) => hit.node)
}
