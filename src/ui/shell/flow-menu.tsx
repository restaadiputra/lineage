import { hasUnsavedWork, NEW_FLOW_YAML } from '../../app/new-flow'
import { useFlow, useServices } from '../app-context'
import { Menu } from './menu'

const CONFIRM = 'Replace the current flow? Its YAML has changes that are not saved to a file.'

/**
 * The flow's name in the top bar. Opens the ways to start over (a new flow, the
 * sample), to compare the flow with the code's, and to share the canvas
 * arrangement as a `.flow.layout.json` file.
 */
export function FlowMenu() {
  const { store, files, layout, compare, code, sampleYaml } = useServices()
  const comparing = useFlow((s) => !!s.comparison)
  const flowName = useFlow((s) => s.valid?.flow.name) ?? 'Untitled flow'

  const mayReplace = () => !hasUnsavedWork(store.getState(), [sampleYaml, NEW_FLOW_YAML]) || window.confirm(CONFIRM)
  const replaceWith = (text: string) => {
    if (mayReplace()) files.startNew(text)
  }

  return (
    <Menu
      label={flowName}
      items={[
        { label: 'New flow', onSelect: () => replaceWith(NEW_FLOW_YAML) },
        { label: 'Load the sample', onSelect: () => replaceWith(sampleYaml) },
        { label: 'New flow from a code folder…', onSelect: () => void code.newFlowFromFolder(mayReplace) },
        comparing
          ? { label: 'Stop comparing', onSelect: () => store.getState().stopComparing() }
          : { label: 'Compare with a flow file…', onSelect: () => void compare.pickCode() },
        ...(comparing ? [] : [{ label: 'Compare with a code folder…', onSelect: () => void code.compareWithFolder() }]),
        { label: 'Export layout…', onSelect: () => void layout.exportLayout() },
        { label: 'Import layout…', onSelect: () => void layout.importLayout() },
      ]}
    />
  )
}
