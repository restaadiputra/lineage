import { useFlow } from '../app-context'
import { Modal } from './modal'
import { NodePicker } from './node-picker'

/** Ctrl/Cmd+K: find a node, Enter selects it and pans to it. */
export function SearchDialog() {
  const open = useFlow((s) => s.dialog === 'search')
  const close = useFlow((s) => s.closeDialog)
  const reveal = useFlow((s) => s.reveal)
  const nodes = useFlow((s) => s.comparison?.merged.flow.nodes ?? s.valid?.flow.nodes)

  return (
    <Modal open={open} onClose={close} label="Search nodes">
      <NodePicker
        nodes={nodes ?? []}
        label="Find a node by id"
        onChoose={(node) => {
          close()
          reveal({ id: node.id })
        }}
      />
    </Modal>
  )
}
