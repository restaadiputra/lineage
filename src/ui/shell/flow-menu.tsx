import { hasUnsavedWork, NEW_FLOW_YAML } from '../../app/new-flow'
import { useFlow, useServices } from '../app-context'
import { Menu } from './menu'

const CONFIRM = 'Replace the current flow? Its YAML has changes that are not saved to a file.'

/** The flow's name in the top bar. Opens the ways to start over: a new flow, or the sample. */
export function FlowMenu() {
  const { store, files, sampleYaml } = useServices()
  const flowName = useFlow((s) => s.valid?.flow.name) ?? 'Untitled flow'

  const replaceWith = (text: string) => {
    const atRisk = hasUnsavedWork(store.getState(), [sampleYaml, NEW_FLOW_YAML])
    if (atRisk && !window.confirm(CONFIRM)) return
    files.startNew(text)
  }

  return (
    <Menu
      label={flowName}
      items={[
        { label: 'New flow', onSelect: () => replaceWith(NEW_FLOW_YAML) },
        { label: 'Load the sample', onSelect: () => replaceWith(sampleYaml) },
      ]}
    />
  )
}
