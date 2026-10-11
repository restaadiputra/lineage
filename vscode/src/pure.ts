/**
 * The parts of the extension that need nothing from VS Code, kept apart so
 * they can be unit tested (the `vscode` module only exists inside the editor).
 */

export interface WebviewAssets {
  /** paths relative to the media folder */
  script: string
  styles: string[]
}

interface ManifestEntry {
  file?: unknown
  css?: unknown
  isEntry?: unknown
}

/** Finds the webview's entry script and stylesheets in Vite's build manifest. */
export function assetsFromManifest(manifest: unknown): WebviewAssets {
  const entries = Object.values((manifest ?? {}) as Record<string, ManifestEntry>)
  const entry = entries.find((candidate) => candidate.isEntry === true && typeof candidate.file === 'string')
  if (!entry) throw new Error('The webview build has no entry. Run "npm run build:vscode".')
  const styles = Array.isArray(entry.css) ? entry.css.filter((item): item is string => typeof item === 'string') : []
  return { script: entry.file as string, styles }
}

interface PageInputs {
  /** URIs the webview can load, already converted by `asWebviewUri` */
  script: string
  styles: string[]
  /** `webview.cspSource`: the only origin anything may be loaded from */
  cspSource: string
}

/**
 * The page the webview shows. Everything comes from the extension's own
 * folder: no network, no inline script. Inline styles are allowed because the
 * diagram positions its nodes with style attributes.
 */
export function webviewHtml({ script, styles, cspSource }: PageInputs): string {
  const policy = [
    `default-src 'none'`,
    `script-src ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource}`,
    `img-src ${cspSource} data:`,
  ].join('; ')
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8" />',
    `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    ...styles.map((href) => `<link rel="stylesheet" href="${href}" />`),
    '<title>Lineage</title>',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script type="module" src="${script}"></script>`,
    '</body>',
    '</html>',
  ].join('\n')
}

export interface SourceLocation {
  path: string
  /** 1-based; undefined when the source names only a file */
  line?: number
}

/** "src/orders/OrderList.tsx:6" → file and line. A Windows drive letter is not mistaken for a line. */
export function parseSource(source: string): SourceLocation {
  const match = /^(.*?):(\d+)(?::\d+)?$/.exec(source.trim())
  return match ? { path: match[1], line: Number(match[2]) } : { path: source.trim() }
}

export interface Replacement {
  /** offsets into the old text */
  start: number
  end: number
  text: string
}

/**
 * The smallest single replacement that turns `before` into `after`. Applying
 * only what changed keeps the cursor and scroll position of a text editor
 * showing the same document, and makes undo steps small.
 */
export function minimalReplacement(before: string, after: string): Replacement | null {
  if (before === after) return null
  const limit = Math.min(before.length, after.length)
  let start = 0
  while (start < limit && before[start] === after[start]) start++
  let fromEnd = 0
  while (fromEnd < limit - start && before[before.length - 1 - fromEnd] === after[after.length - 1 - fromEnd]) fromEnd++
  return { start, end: before.length - fromEnd, text: after.slice(start, after.length - fromEnd) }
}

/** The layout file that sits next to a flow file: orders.flow.yaml → orders.flow.layout.json */
export const layoutFileFor = (flowFileName: string) => `${flowFileName.replace(/\.ya?ml$/i, '')}.layout.json`
