import { yaml as yamlLanguage } from '@codemirror/lang-yaml'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useEffect, useState } from 'react'
import { useFlow } from '../app-context'
import './editor.css'
import { editorTheme } from './editor-theme'
import { highlightedLine, setHighlightedLine } from './line-highlight'
import { toLintDiagnostics } from './to-lint-diagnostics'

const extensions = [yamlLanguage(), lintGutter(), highlightedLine, editorTheme]
const setup = { autocompletion: false, highlightSelectionMatches: false }

/** Pushes parser diagnostics into the editor as lint marks. */
function useDiagnostics(view: EditorView | null) {
  const diagnostics = useFlow((s) => s.diagnostics)
  useEffect(() => {
    if (view) view.dispatch(setDiagnostics(view.state, toLintDiagnostics(diagnostics, view.state.doc)))
  }, [view, diagnostics])
}

/** Scrolls to and highlights the line of the node selected on the canvas. */
function useSelectedNodeLine(view: EditorView | null) {
  const line = useFlow((s) => (s.selection ? s.valid?.nodeLines[s.selection.id] : undefined))
  useEffect(() => {
    if (!view) return
    const { doc } = view.state
    if (line === undefined || line > doc.lines) {
      view.dispatch({ effects: setHighlightedLine.of(null) })
      return
    }
    view.dispatch({
      effects: [setHighlightedLine.of(line), EditorView.scrollIntoView(doc.line(line).from, { y: 'center' })],
    })
  }, [view, line])
}

export function YamlEditor() {
  const text = useFlow((s) => s.yaml)
  const setYaml = useFlow((s) => s.setYaml)
  const errorCount = useFlow((s) => s.diagnostics.filter((d) => d.severity === 'error').length)
  const [view, setView] = useState<EditorView | null>(null)

  useDiagnostics(view)
  useSelectedNodeLine(view)

  return (
    <>
      <div className="panel__header">
        <span>YAML</span>
        {errorCount > 0 && (
          <span className="editor__errors">
            {errorCount} {errorCount === 1 ? 'error' : 'errors'}
          </span>
        )}
      </div>
      <CodeMirror
        className="editor"
        value={text}
        onChange={setYaml}
        onCreateEditor={setView}
        extensions={extensions}
        basicSetup={setup}
        theme="none"
        height="100%"
        aria-label="Flow YAML"
      />
    </>
  )
}
