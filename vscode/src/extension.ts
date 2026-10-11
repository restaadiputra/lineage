import * as vscode from 'vscode'
import { FlowEditorProvider, VIEW_TYPE, type FlowStatus } from './flow-editor'

/** What the extension exposes to other extensions and to its own integration test. */
export interface LineageApi {
  /** What the diagram for this document last reported; undefined while none is open. */
  statusOf(uri: vscode.Uri): FlowStatus | undefined
  /** Everything Lineage remembers for this workspace (settings, node positions). */
  stored(): Record<string, string>
}

const isFlowFile = (uri: vscode.Uri | undefined): uri is vscode.Uri => !!uri && /\.flow\.ya?ml$/i.test(uri.path)

export function activate(context: vscode.ExtensionContext): LineageApi {
  const diagnostics = vscode.languages.createDiagnosticCollection('lineage')
  const provider = new FlowEditorProvider(context, diagnostics)

  const open = (column: vscode.ViewColumn) => async (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri
    if (!isFlowFile(target)) {
      void vscode.window.showInformationMessage('Open a .flow.yaml file to see it as a Lineage diagram.')
      return
    }
    await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE, column)
  }

  context.subscriptions.push(
    diagnostics,
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      // Keep the diagram (zoom, selection) alive when its tab is in the background.
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('lineage.openDiagram', open(vscode.ViewColumn.Active)),
    vscode.commands.registerCommand('lineage.openDiagramToSide', open(vscode.ViewColumn.Beside)),
  )

  return {
    statusOf: (uri) => provider.statuses.get(uri.toString()),
    stored: () => provider.stored(),
  }
}

export function deactivate(): void {}
