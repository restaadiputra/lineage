# Lineage for VS Code

Opens a `.flow.yaml` file as a Lineage diagram inside VS Code: what reads, writes and re-renders, checked against
React rules. It is the same app as the web version, hosted in a webview, with the file handled by VS Code.

## Using it

- Open a `.flow.yaml` file and press the diagram button in the editor title bar (**Lineage: Open diagram to the
  side**), or right-click the file → **Open diagram**. The text stays the default editor for these files.
- The diagram and the text are the same document. Typing in the text editor, an edit by Copilot, or a `git pull`
  redraws the diagram; adding a node or a connection on the canvas edits the text. Save and undo are VS Code's.
- Rule problems appear in the **Problems** panel, on the line of the node they are about.
- **Open** next to a node's `source` in the inspector jumps to that file and line. Only files inside the
  workspace are opened.
- A `name.flow.layout.json` next to the flow file is applied when the diagram opens (once per version of that
  file). Node positions you change are remembered per workspace; use the flow menu → **Export layout…** to write
  them back to the file for your team.
- Flow menu → **Compare with a code folder…** reads React source without AI and compares it with the flow.

Nothing is sent anywhere: the webview loads only files from the extension's own folder.

## Building

From the repository root:

```
npm install
npm run build:vscode     # webview bundle → vscode/media, extension → vscode/out
npm run test:vscode      # runs the extension inside a real VS Code
```

To try it by hand: open the `vscode` folder in VS Code and press F5, or package it with
`npx @vscode/vsce package --no-dependencies` (run inside `vscode/`) and install the `.vsix`.

## How it is put together

| Part | Where | What it does |
|---|---|---|
| Extension host | `vscode/src` | Registers the custom editor, writes the webview page and its security policy, applies edits to the document, shows dialogs, publishes diagnostics. |
| Webview entry | `src/vscode/webview-main.tsx` | Composes the app with adapters that talk to the extension instead of the browser. |
| Contract | `src/vscode/protocol.ts` | Every message between the two. Both sides import only this from each other. |

Tests: `vscode/src/pure.test.ts` and `src/vscode/webview.test.ts` (unit), `e2e/vscode-webview.spec.ts` (the webview
bundle under the extension's security policy, with a stand-in for VS Code), `vscode/test/suite.ts` (inside VS Code).
