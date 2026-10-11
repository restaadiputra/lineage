import { compareFlows, mergeFlows, type FlowDiff } from '../analysis/compare'
import { buildGraph, type Graph } from '../model/graph'
import type { FlowFile } from '../model/schema'

/** The plan (the flow being edited) set against a second flow file, "the code". */
export interface Comparison {
  /** name of the file the code flow came from */
  fileName: string
  code: FlowFile
  diff: FlowDiff
  /** both flows in one, which is what the canvas draws while comparing */
  merged: { flow: FlowFile; graph: Graph }
}

export function buildComparison(plan: FlowFile, code: FlowFile, fileName: string): Comparison {
  const flow = mergeFlows(plan, code)
  return { fileName, code, diff: compareFlows(plan, code), merged: { flow, graph: buildGraph(flow) } }
}

/** How many differences there are, for a one-line summary. */
export const differenceCount = ({ counts }: FlowDiff) => counts['plan-only'] + counts['code-only'] + counts.changed
