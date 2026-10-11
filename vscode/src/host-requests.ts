import * as vscode from 'vscode'
import type { FileType } from '../../src/app/ports'
import { isReadable } from '../../src/reader/source-files'
import type { HostRequest, HostResults } from '../../src/vscode/protocol'

const decoder = new TextDecoder()
const encoder = new TextEncoder()
const baseName = (uri: vscode.Uri) => uri.path.split('/').pop() ?? ''

const filtersFor = ({ description, extensions }: FileType): Record<string, string[]> | undefined =>
  extensions.length ? { [description]: extensions.map((extension) => extension.replace(/^\./, '')) } : undefined

/** More files than any feature folder has; a guard against picking a whole monorepo. */
const MAX_FILES = 3000
const MAX_SOURCE_BYTES = 1_000_000

async function openText(fileType: FileType, near: vscode.Uri): Promise<HostResults['openText']> {
  const [picked] = (await vscode.window.showOpenDialog({ canSelectMany: false, defaultUri: near, filters: filtersFor(fileType) })) ?? []
  return picked ? { name: baseName(picked), text: decoder.decode(await vscode.workspace.fs.readFile(picked)) } : null
}

async function saveText(file: { name: string; text: string }, fileType: FileType, near: vscode.Uri): Promise<boolean> {
  const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(near, file.name), filters: filtersFor(fileType) })
  if (!target) return false
  await vscode.workspace.fs.writeFile(target, encoder.encode(file.text))
  return true
}

/** Pick a folder (the workspace by default) and read its source files for the code reader. */
async function openFolder(near: vscode.Uri): Promise<HostResults['openFolder']> {
  const workspace = vscode.workspace.getWorkspaceFolder(near)?.uri ?? near
  const [folder] = (await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, defaultUri: workspace, openLabel: 'Read code' })) ?? []
  if (!folder) return null

  const found = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.{ts,tsx,js,jsx}'), '**/node_modules/**', MAX_FILES)
  const files = await Promise.all(
    found
      .map((uri) => ({ uri, path: uri.path.slice(folder.path.length + 1) }))
      .filter(({ path }) => isReadable(path))
      .map(async ({ uri, path }) => {
        const bytes = await vscode.workspace.fs.readFile(uri)
        return bytes.byteLength <= MAX_SOURCE_BYTES ? { path, text: decoder.decode(bytes) } : null
      }),
  )
  return { name: baseName(folder), files: files.filter((file) => file !== null) }
}

/** Runs one request from the webview. `near` is the folder of the flow file, where dialogs start. */
export function runRequest(request: HostRequest, near: vscode.Uri): Promise<HostResults[HostRequest['kind']]> {
  switch (request.kind) {
    case 'openText':
      return openText(request.fileType, near)
    case 'saveText':
      return saveText(request.file, request.fileType, near)
    case 'openFolder':
      return openFolder(near)
  }
}
