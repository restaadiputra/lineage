import { useEffect } from 'react'
import { useServices } from '../app-context'

/** How the platform's shortcut modifier is written in labels: "⌘" or "Ctrl+". */
export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

/**
 * Global keyboard shortcuts: Esc clears the selection; with Ctrl/Cmd,
 * O opens, S saves, E toggles the editor and K opens search.
 */
export function useShortcuts({ onSearch }: { onSearch(): void }): void {
  const { store, files } = useServices()

  useEffect(() => {
    const commands: Record<string, () => void> = {
      o: () => void files.open(),
      s: () => void files.save(),
      e: () => store.getState().updateSettings({ editorOpen: !store.getState().settings.editorOpen }),
      k: onSearch,
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // In the editor, dialogs and menus Esc already has a job (close search, tooltips, the menu).
        if (event.target instanceof Element && event.target.closest('.cm-editor, dialog, [role="menu"]')) return
        store.getState().select(null)
        // React Flow treats Escape on a focused node as a selection key: once the
        // node is deselected it would select it again. This key is ours.
        event.stopPropagation()
        return
      }
      const command = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && commands[event.key.toLowerCase()]
      if (!command) return
      // Stops the browser's own Open / Save page / address-bar search.
      event.preventDefault()
      command()
    }
    // Capture: these must win over the editor's own key bindings.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [store, files, onSearch])
}
