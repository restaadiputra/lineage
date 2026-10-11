import type { Clipboard } from '../app/ports'

export function createBrowserClipboard(): Clipboard {
  return { copy: (text) => navigator.clipboard.writeText(text) }
}
