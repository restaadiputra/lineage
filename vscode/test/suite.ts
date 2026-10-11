import * as assert from 'node:assert/strict'
import * as vscode from 'vscode'
import type { LineageApi } from '../src/extension'

/**
 * Runs inside a real VS Code (see run.mjs). The webview cannot be inspected
 * from here, so these checks rely on what it reports back: its status, the
 * problems it publishes and the positions it stores once the layout has run.
 */

const TIMEOUT_MS = 30_000

async function waitFor(what: string, check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for: ${what}`)
}

async function step(name: string, body: () => Promise<void>): Promise<void> {
  await body()
  console.log(`  ok  ${name}`)
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<LineageApi>('lineage.lineage')
  assert.ok(extension, 'the extension is installed')
  const api = await extension.activate()

  const [folder] = vscode.workspace.workspaceFolders ?? []
  assert.ok(folder, 'a workspace folder is open')
  const uri = vscode.Uri.joinPath(folder.uri, 'orders.flow.yaml')
  const lineageProblems = () => vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'Lineage')

  await step('opens a .flow.yaml as a diagram, and the webview loads under its security policy', async () => {
    await vscode.commands.executeCommand('vscode.openWith', uri, 'lineage.flow')
    await waitFor('the diagram to report 21 nodes', () => api.statusOf(uri)?.nodeCount === 21)
  })

  await step('publishes rule problems to the Problems panel, on the right lines', async () => {
    await waitFor('diagnostics', () => lineageProblems().length > 0)
    const mutation = lineageProblems().find((d) => d.code === 'mutation')
    assert.ok(mutation, 'the mutation is reported')
    assert.equal(mutation.severity, vscode.DiagnosticSeverity.Error)
    const document = await vscode.workspace.openTextDocument(uri)
    assert.equal(document.lineAt(mutation.range.start.line).text.trim(), '- id: QtyStepper')
    assert.equal(api.statusOf(uri)?.problemCount, lineageProblems().length)
  })

  const storedPositions = () => JSON.parse(api.stored()['lineage:positions:Orders dashboard'] ?? '{}') as Record<string, { x: number; y: number }>

  await step('lays the diagram out and remembers positions in the workspace', async () => {
    // The layout engine runs inside the webview; all 21 positions arriving proves it ran under the security policy.
    await waitFor('a position for every node', () => Object.keys(storedPositions()).length === 21)
  })

  await step('applies the layout file that sits next to the flow', async () => {
    await waitFor('the shared layout to be applied', () => 'lineage:layout-applied:orders.flow.layout.json' in api.stored())
    await waitFor('the shared position', () => storedPositions().App?.x === 1234 && storedPositions().App?.y === 56)
  })

  await step('follows edits made to the document outside the diagram', async () => {
    const document = await vscode.workspace.openTextDocument(uri)
    const at = document.getText().indexOf('\nedges:\n')
    assert.ok(at > 0)
    const edit = new vscode.WorkspaceEdit()
    edit.insert(uri, document.positionAt(at), '\n  - id: Toast\n    kind: component\n')
    assert.ok(await vscode.workspace.applyEdit(edit))
    await waitFor('the diagram to report 22 nodes', () => api.statusOf(uri)?.nodeCount === 22)
  })

  await step('reports a broken file, then recovers', async () => {
    const document = await vscode.workspace.openTextDocument(uri)
    const original = document.getText()
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(original.length))

    const broken = new vscode.WorkspaceEdit()
    broken.replace(uri, whole, 'version: 1\nnodes:\n  - id: App\n    kind: nonsense\n')
    await vscode.workspace.applyEdit(broken)
    await waitFor('an error with no rule code', () => lineageProblems().some((d) => d.code === undefined && d.severity === vscode.DiagnosticSeverity.Error))

    await vscode.commands.executeCommand('undo')
    await waitFor('the rule problems to come back', () => lineageProblems().some((d) => d.code === 'mutation'))
  })

  await step('clears its problems when the diagram is closed', async () => {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor')
    await waitFor('diagnostics to clear', () => lineageProblems().length === 0 && api.statusOf(uri) === undefined)
  })
}
