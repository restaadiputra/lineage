import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const tint = (token: string, percent: number) => `color-mix(in srgb, var(${token}) ${percent}%, transparent)`

/**
 * Editor chrome built from the app's CSS variables, so it follows light/dark
 * without swapping CodeMirror themes.
 */
const chrome = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--text-xs)', color: 'var(--ink)', backgroundColor: 'var(--surface)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
  '.cm-content': { caretColor: 'var(--ink)', padding: '8px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: tint('--source', 22),
  },
  '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: 'var(--muted)' },

  // The node selected on the canvas.
  '.cm-lineage-node-line': { backgroundColor: tint('--source', 12), boxShadow: 'inset 2px 0 0 var(--source)' },

  // Diagnostics: token colors instead of CodeMirror's fixed red/orange images.
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--error)' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--warning)' },
  '.cm-lint-marker': { width: '7px', height: '7px', margin: '6px 4px', borderRadius: '50%' },
  '.cm-lint-marker-error': { content: '""', backgroundColor: 'var(--error)' },
  '.cm-lint-marker-warning': { content: '""', backgroundColor: 'var(--warning)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--hairline)',
    borderRadius: '6px',
    color: 'var(--ink)',
    fontFamily: 'var(--font-ui)',
    fontSize: 'var(--text-xs)',
  },
  '.cm-diagnostic': { padding: '6px 10px' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--error)' },
  '.cm-diagnostic-warning': { borderLeftColor: 'var(--warning)' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--hairline)' },
})

/** Monochrome syntax: color in this app is reserved for data routes and problems. */
const syntax = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], fontWeight: '500' },
  { tag: [tags.comment, tags.meta], color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [tags.punctuation, tags.separator, tags.squareBracket, tags.brace], color: 'var(--muted)' },
])

export const editorTheme = [chrome, syntaxHighlighting(syntax)]
