import * as vscode from 'vscode'
import type { HostProblem, ToHost, ToWebview } from '../../src/vscode/protocol'
import { runRequest } from './host-requests'
import { assetsFromManifest, isWithin, layoutFileFor, minimalReplacement, parseSource, webviewHtml } from './pure'

export const VIEW_TYPE = 'lineage.flow'
const STORAGE_KEY = 'lineage.storage'

/** What a diagram last reported about its document. */
export interface FlowStatus {
  nodeCount: number
  problemCount: number
}

const decoder = new TextDecoder()
const baseName = (uri: vscode.Uri) => uri.path.split('/').pop() ?? ''
const folderOf = (uri: vscode.Uri) => vscode.Uri.joinPath(uri, '..')

const SEVERITY: Record<HostProblem['severity'], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
}

function toDiagnostic(document: vscode.TextDocument, problem: HostProblem): vscode.Diagnostic {
  // A problem without a place is shown on the first line rather than dropped.
  const line = Math.min(Math.max((problem.line ?? 1) - 1, 0), Math.max(document.lineCount - 1, 0))
  const diagnostic = new vscode.Diagnostic(document.lineAt(line).range, problem.message, SEVERITY[problem.severity])
  diagnostic.source = 'Lineage'
  if (problem.code) diagnostic.code = problem.code
  return diagnostic
}

async function readIfExists(uri: vscode.Uri): Promise<string | null> {
  try {
    return decoder.decode(await vscode.workspace.fs.readFile(uri))
  } catch {
    return null
  }
}

/**
 * Shows a `.flow.yaml` document as a Lineage diagram. The document stays a
 * normal VS Code text document, so saving, undo, the text editor beside the
 * diagram and other tools (Copilot, git) all work on the same text.
 */
export class FlowEditorProvider implements vscode.CustomTextEditorProvider {
  readonly statuses = new Map<string, FlowStatus>()
  private readonly context: vscode.ExtensionContext
  private readonly diagnostics: vscode.DiagnosticCollection

  constructor(context: vscode.ExtensionContext, diagnostics: vscode.DiagnosticCollection) {
    this.context = context
    this.diagnostics = diagnostics
  }

  stored(): Record<string, string> {
    return this.context.workspaceState.get<Record<string, string>>(STORAGE_KEY, {})
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media')
    const { webview } = panel
    webview.options = { enableScripts: true, localResourceRoots: [media] }
    webview.html = await this.page(webview, media)

    const key = document.uri.toString()
    const post = (message: ToWebview) => void webview.postMessage(message)
    // The text the webview last sent. A document change to exactly this is its own edit coming back.
    let fromWebview: string | null = null

    const onDocumentChange = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== key || event.contentChanges.length === 0) return
      const text = document.getText()
      if (text !== fromWebview) post({ type: 'document', text })
    })

    const onMessage = webview.onDidReceiveMessage(async (message: ToHost) => {
      switch (message.type) {
        case 'ready':
          return post(await this.init(document))
        case 'edit':
          fromWebview = message.text
          return void (await this.applyEdit(document, message.text))
        case 'save':
          return void (await document.save())
        case 'store':
          return void (await this.remember(message.key, message.value))
        case 'status':
          this.statuses.set(key, { nodeCount: message.nodeCount, problemCount: message.problems.length })
          return this.diagnostics.set(document.uri, message.problems.map((problem) => toDiagnostic(document, problem)))
        case 'copy':
          return void (await vscode.env.clipboard.writeText(message.text))
        case 'openSource':
          return void (await this.openSource(document, message.source))
        case 'request':
          return post(await this.answer(message.id, () => runRequest(message.request, folderOf(document.uri))))
      }
    })

    panel.onDidDispose(() => {
      onDocumentChange.dispose()
      onMessage.dispose()
      this.statuses.delete(key)
      this.diagnostics.delete(document.uri)
    })
  }

  private async page(webview: vscode.Webview, media: vscode.Uri): Promise<string> {
    const manifest = await readIfExists(vscode.Uri.joinPath(media, '.vite', 'manifest.json'))
    const assets = assetsFromManifest(manifest ? JSON.parse(manifest) : null)
    const uri = (path: string) => webview.asWebviewUri(vscode.Uri.joinPath(media, path)).toString()
    return webviewHtml({ script: uri(assets.script), styles: assets.styles.map(uri), cspSource: webview.cspSource })
  }

  private async init(document: vscode.TextDocument): Promise<ToWebview> {
    const fileName = baseName(document.uri)
    const layoutName = layoutFileFor(fileName)
    const layoutText = await readIfExists(vscode.Uri.joinPath(folderOf(document.uri), layoutName))
    return {
      type: 'init',
      text: document.getText(),
      fileName,
      storage: this.stored(),
      layout: layoutText === null ? null : { name: layoutName, text: layoutText },
    }
  }

  private async applyEdit(document: vscode.TextDocument, text: string): Promise<boolean> {
    const change = minimalReplacement(document.getText(), text)
    if (!change) return true
    const edit = new vscode.WorkspaceEdit()
    edit.replace(document.uri, new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)), change.text)
    return vscode.workspace.applyEdit(edit)
  }

  private async remember(key: string, value: string | null): Promise<void> {
    const { [key]: _previous, ...rest } = this.stored()
    await this.context.workspaceState.update(STORAGE_KEY, value === null ? rest : { ...rest, [key]: value })
  }

  /** Open a node's `source`, looked up from the workspace root and then from the flow file's folder. */
  private async openSource(document: vscode.TextDocument, source: string): Promise<void> {
    const { path, line } = parseSource(source)
    const roots = [vscode.workspace.getWorkspaceFolder(document.uri)?.uri, folderOf(document.uri)].filter((root) => root !== undefined)
    // The workspace, or the flow file's folder when it is opened on its own.
    const boundary = roots[0]
    for (const root of roots) {
      // joinPath resolves "..", so a path that climbs out of the boundary is caught here.
      const target = vscode.Uri.joinPath(root, path)
      if (!isWithin(boundary.path, target.path)) continue
      if ((await readIfExists(target)) === null) continue
      const position = new vscode.Position(Math.max((line ?? 1) - 1, 0), 0)
      await vscode.window.showTextDocument(target, { selection: new vscode.Range(position, position), viewColumn: vscode.ViewColumn.Beside })
      return
    }
    void vscode.window.showWarningMessage(`Lineage could not find ${path} in this workspace.`)
  }

  private async answer(id: number, run: () => Promise<unknown>): Promise<ToWebview> {
    try {
      return { type: 'response', id, result: await run() }
    } catch (error) {
      return { type: 'response', id, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
