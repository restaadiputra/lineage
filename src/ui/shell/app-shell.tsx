import { useCallback, useState, type ReactNode } from 'react'
import { PANEL_LIMITS } from '../../app/settings'
import { useFlow } from '../app-context'
import { CompareBar } from './compare-bar'
import { DiskChangeBanner } from './disk-change-banner'
import './overlays.css'
import { ResizeHandle } from './resize-handle'
import { SearchDialog } from './search-dialog'
import './shell.css'
import { StatusBar } from './status-bar'
import { TopBar } from './top-bar'
import { useFileDrop, useFileWatch } from './use-file-watch'
import { useShortcuts } from './use-shortcuts'
import { useTheme } from './use-theme'

interface AppShellProps {
  editor: ReactNode
  canvas: ReactNode
  inspector: ReactNode
}

/** Top bar, three full-bleed panels and the status bar. Knows nothing about panel contents. */
export function AppShell({ editor, canvas, inspector }: AppShellProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useTheme()
  useShortcuts({ onSearch: openSearch })
  useFileWatch()
  const dropping = useFileDrop()
  const { editorOpen, editorWidth, inspectorWidth } = useFlow((s) => s.settings)
  const updateSettings = useFlow((s) => s.updateSettings)

  return (
    <div className="shell" data-dropping={dropping || undefined}>
      <TopBar onSearch={openSearch} />
      <div className="banners">
        <DiskChangeBanner />
        <CompareBar />
      </div>
      <div className="panels">
        {editorOpen && (
          <>
            <section className="panel" style={{ width: editorWidth }} aria-label="YAML editor">
              {editor}
            </section>
            <ResizeHandle
              label="Resize YAML editor"
              value={editorWidth}
              direction={1}
              {...PANEL_LIMITS.editor}
              onChange={(editorWidth) => updateSettings({ editorWidth })}
            />
          </>
        )}
        <main className="panel panel--canvas" aria-label="Diagram">
          {canvas}
        </main>
        <ResizeHandle
          label="Resize inspector"
          value={inspectorWidth}
          direction={-1}
          {...PANEL_LIMITS.inspector}
          onChange={(inspectorWidth) => updateSettings({ inspectorWidth })}
        />
        <aside className="panel" style={{ width: inspectorWidth }} aria-label="Inspector">
          {inspector}
        </aside>
      </div>
      <StatusBar />
      <SearchDialog open={searchOpen} onClose={closeSearch} />
    </div>
  )
}
