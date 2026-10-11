import { useEffect } from 'react'
import { useServices } from '../app-context'

/** How the platform's shortcut modifier is written in labels: "⌘" or "Ctrl+". */
export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

/** Where a plain letter is text being typed, not a command. */
const TYPING = 'input, textarea, select, [contenteditable], .cm-editor, dialog, [role="menu"]'

/**
 * Global keyboard shortcuts. Esc clears the selection; with Ctrl/Cmd, O opens,
 * S saves, E toggles the editor and K opens search. On the canvas, plain N
 * adds a node and C connects the selected one.
 */
export function useShortcuts(): void {
  const { store, files } = useServices()

  useEffect(() => {
    const state = () => store.getState()
    const withModifier: Record<string, () => void> = {
      o: () => void files.open(),
      s: () => void files.save(),
      e: () => state().updateSettings({ editorOpen: !state().settings.editorOpen }),
      k: () => state().openDialog('search'),
    }
    const plain: Record<string, () => void> = {
      n: () => state().openDialog('add-node'),
      c: () => state().openDialog('connect'),
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const typing = event.target instanceof Element && !!event.target.closest(TYPING)
      if (event.key === 'Escape') {
        // In the editor, dialogs and menus Esc already has a job (close search, tooltips, the menu).
        if (event.target instanceof Element && event.target.closest('.cm-editor, dialog, [role="menu"]')) return
        state().select(null)
        // React Flow treats Escape on a focused node as a selection key: once the
        // node is deselected it would select it again. This key is ours.
        event.stopPropagation()
        return
      }
      if (event.altKey || event.shiftKey) return
      const modified = event.ctrlKey || event.metaKey
      const command = modified ? withModifier[event.key.toLowerCase()] : typing ? undefined : plain[event.key.toLowerCase()]
      if (!command) return
      // Stops the browser's own Open / Save, and keeps the letter out of the field a dialog focuses.
      event.preventDefault()
      command()
    }
    // Capture: these must win over the editor's own key bindings.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [store, files])
}
