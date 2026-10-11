import { codeToDiagramPrompt, diagramToCodePrompt } from '../../app/prompts'
import { useServices } from '../app-context'
import { Menu } from './menu'

/**
 * Lineage has no AI of its own: this menu hands the format spec and the
 * diagram to whichever assistant the user works with.
 */
export function AskAiMenu() {
  const { store, clipboard, files, formatDoc } = useServices()

  const copy = (text: string, done: string) =>
    void clipboard.copy(text).then(
      () => store.getState().notify(done),
      () => store.getState().notify('Could not copy: clipboard access was blocked'),
    )

  return (
    <Menu
      label="Ask AI"
      items={[
        {
          label: 'Copy prompt: code → diagram',
          onSelect: () => copy(codeToDiagramPrompt(formatDoc), 'Prompt copied. Paste it into your AI and list the files'),
        },
        {
          label: 'Copy prompt: diagram → code',
          onSelect: () => copy(diagramToCodePrompt(formatDoc, store.getState().yaml), 'Prompt copied with the current diagram'),
        },
        { label: 'Download FORMAT.md', onSelect: () => files.download('FORMAT.md', formatDoc) },
      ]}
    />
  )
}
