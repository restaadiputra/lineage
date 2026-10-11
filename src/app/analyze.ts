import { applyIgnores, runRules, type CheckedProblems } from '../analysis/rules'
import { buildGraph, type Graph } from '../model/graph'
import { parseFlow, type Diagnostic } from '../model/parse'
import type { FlowFile } from '../model/schema'

/** Everything derived from one valid flow file. */
export interface ValidFlow {
  flow: FlowFile
  graph: Graph
  problems: CheckedProblems
  /** node id → 1-based line where the node is defined */
  nodeLines: Record<string, number>
}

export interface Analysis {
  diagnostics: Diagnostic[]
  /** null when the text has errors; callers keep showing their last valid one */
  valid: ValidFlow | null
}

/** YAML text → diagnostics, graph and rule problems. Pure. */
export function analyze(text: string): Analysis {
  const { flow, diagnostics, nodeLines } = parseFlow(text)
  if (!flow) return { diagnostics, valid: null }
  const graph = buildGraph(flow)
  const problems = applyIgnores(runRules(graph), flow.ignore)
  return { diagnostics, valid: { flow, graph, problems, nodeLines } }
}
