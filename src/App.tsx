import { FlowCanvas } from './ui/canvas/flow-canvas'
import { YamlEditor } from './ui/editor/yaml-editor'
import { Inspector } from './ui/inspector/inspector'
import { AppShell } from './ui/shell/app-shell'

export default function App() {
  return <AppShell editor={<YamlEditor />} canvas={<FlowCanvas />} inspector={<Inspector />} />
}
