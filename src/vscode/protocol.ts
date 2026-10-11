import type { FileType, TextFile } from '../app/ports'
import type { SourceInput } from '../reader/source-files'

/**
 * Messages between the Lineage webview and the VS Code extension that hosts
 * it. This file is the whole contract: both sides import it, and neither
 * imports anything else from the other.
 */

/** A problem to show in VS Code's Problems panel. */
export interface HostProblem {
  /** 1-based line in the flow file; undefined when it has no place */
  line?: number
  severity: 'error' | 'warning' | 'info'
  message: string
  /** rule id, e.g. "prop-drilling"; undefined for errors in the file itself */
  code?: string
}

/** Things the webview asks the host to do and waits for. */
export type HostRequest =
  | { kind: 'openText'; fileType: FileType }
  | { kind: 'saveText'; file: TextFile; fileType: FileType }
  | { kind: 'openFolder' }

export interface HostResults {
  openText: TextFile | null
  saveText: boolean
  openFolder: { name: string; files: SourceInput[] } | null
}

export type ToHost =
  /** the webview has loaded and wants the document */
  | { type: 'ready' }
  /** the YAML changed in the webview (canvas edit, built-in editor) */
  | { type: 'edit'; text: string }
  | { type: 'save' }
  /** remember a value across sessions; null forgets it */
  | { type: 'store'; key: string; value: string | null }
  | { type: 'status'; nodeCount: number; problems: HostProblem[] }
  /** open "path/to/file.tsx:12" from a node's `source` */
  | { type: 'openSource'; source: string }
  | { type: 'copy'; text: string }
  | { type: 'request'; id: number; request: HostRequest }

export type ToWebview =
  | {
      type: 'init'
      text: string
      fileName: string
      /** everything remembered from earlier sessions */
      storage: Record<string, string>
      /** the `.flow.layout.json` next to the file, when there is one */
      layout: TextFile | null
    }
  /** the document changed outside the webview (typing in the text editor, Copilot, git) */
  | { type: 'document'; text: string }
  | { type: 'response'; id: number; result?: unknown; error?: string }
