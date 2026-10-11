import type { FlowState, FlowStore } from '../app/flow-store'
import type { HostBridge } from './host-bridge'
import type { HostProblem } from './protocol'

/** What VS Code should show in its Problems panel for the current state. */
export function hostProblems({ diagnostics, valid }: Pick<FlowState, 'diagnostics' | 'valid'>): HostProblem[] {
  const fromFile = diagnostics.map(({ line, severity, message }): HostProblem => ({ line, severity, message }))
  // While the file has errors the rule results describe an older version of it.
  if (!valid || diagnostics.some((d) => d.severity === 'error')) return fromFile

  const fromRules = valid.problems.active.map(
    ({ rule, severity, title, fix, nodes }): HostProblem => ({
      line: nodes[0] ? valid.nodeLines[nodes[0]] : undefined,
      severity,
      message: `${title}. ${fix}`,
      code: rule,
    }),
  )
  return [...fromFile, ...fromRules]
}

/**
 * Keeps the store and the VS Code document the same text, in both directions,
 * and reports problems as they change.
 *
 * `hostText` is the text VS Code is known to have. An edit is sent only when
 * the store differs from it, and text arriving from VS Code updates it first,
 * so a change is never echoed back to where it came from.
 */
export function connectDocument(store: FlowStore, bridge: HostBridge, initialText: string): () => void {
  let hostText = initialText
  let reported = ''

  const report = (state: FlowState) => {
    const problems = hostProblems(state)
    const status = { type: 'status' as const, nodeCount: state.valid?.flow.nodes.length ?? 0, problems }
    const signature = JSON.stringify(status)
    if (signature === reported) return
    reported = signature
    bridge.post(status)
  }

  const stopListening = bridge.subscribe((message) => {
    if (message.type !== 'document' || message.text === store.getState().yaml) return
    hostText = message.text
    store.getState().loadYaml(message.text)
  })

  const stopWatching = store.subscribe((state) => {
    if (state.yaml !== hostText) {
      hostText = state.yaml
      bridge.post({ type: 'edit', text: state.yaml })
    }
    report(state)
  })

  report(store.getState())
  return () => {
    stopListening()
    stopWatching()
  }
}
