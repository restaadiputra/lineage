import { THEMES } from '../../app/settings'
import { useFlow, useServices } from '../app-context'
import { AskAiMenu } from './ask-ai-menu'
import { FlowMenu } from './flow-menu'
import { PanelLeftIcon, SearchIcon, ThemeIcon } from './icons'
import { MOD } from './use-shortcuts'

/** The flow's name (a menu for starting over), its file, and whether the editor is ahead of the disk. */
function FlowTitle() {
  const fileName = useFlow((s) => s.file?.name)
  const unsaved = useFlow((s) => !!s.file && s.file.savedText !== s.yaml)
  return (
    <span className="top-bar__flow">
      <FlowMenu />
      {fileName && <span className="top-bar__file">{fileName}</span>}
      {unsaved && <span className="top-bar__unsaved">Unsaved changes</span>}
    </span>
  )
}

export function TopBar() {
  const { files } = useServices()
  const theme = useFlow((s) => s.settings.theme)
  const editorOpen = useFlow((s) => s.settings.editorOpen)
  const updateSettings = useFlow((s) => s.updateSettings)
  const openDialog = useFlow((s) => s.openDialog)
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
  const themeLabel = theme[0].toUpperCase() + theme.slice(1)

  return (
    <header className="top-bar">
      <button
        type="button"
        className="btn btn--icon"
        aria-pressed={editorOpen}
        aria-label="YAML editor"
        title={`Toggle YAML editor (${MOD}E)`}
        onClick={() => updateSettings({ editorOpen: !editorOpen })}
      >
        <PanelLeftIcon />
      </button>
      <h1 className="top-bar__brand">Lineage</h1>
      <FlowTitle />
      <span className="top-bar__rule" />
      <button type="button" className="btn" title={`Open a flow file (${MOD}O)`} onClick={() => void files.open()}>
        Open
      </button>
      <button type="button" className="btn" title={`Save (${MOD}S)`} onClick={() => void files.save()}>
        Save
      </button>
      <span className="top-bar__rule" />
      <AskAiMenu />
      <span className="top-bar__spacer" />
      <button type="button" className="btn top-bar__search" onClick={() => openDialog('search')}>
        <SearchIcon />
        Search
        <kbd>{MOD}K</kbd>
      </button>
      <button
        type="button"
        className="btn"
        aria-label={`Theme: ${themeLabel}`}
        title={`Switch to ${nextTheme} theme`}
        onClick={() => updateSettings({ theme: nextTheme })}
      >
        <ThemeIcon />
        {themeLabel}
      </button>
    </header>
  )
}
