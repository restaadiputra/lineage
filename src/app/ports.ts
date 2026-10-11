/**
 * Ports: the small interfaces the application layer depends on.
 * Concrete implementations live in src/adapters and are chosen in main.tsx.
 */

/** String key-value storage (localStorage in the browser, a Map in tests). */
export interface KeyValueStore {
  read(key: string): string | null
  write(key: string, value: string): void
  remove(key: string): void
}

export interface Clipboard {
  copy(text: string): Promise<void>
}

/** A file the user opened or saved. */
export interface FileRef {
  name: string
  /** adapter-specific handle; null when the browser can neither write back nor watch the file */
  handle: unknown
}

export interface OpenedFile {
  ref: FileRef
  text: string
  lastModified: number
}

/** Reading and writing flow files on the user's disk. */
export interface FileGateway {
  /** Ask the user for a file. Null when they cancel. */
  open(): Promise<OpenedFile | null>
  /** The first file of a drag and drop. Null when nothing usable was dropped. */
  fromDrop(transfer: DataTransfer): Promise<OpenedFile | null>
  read(ref: FileRef): Promise<OpenedFile>
  /** Null when the file cannot be watched. */
  lastModified(ref: FileRef): Promise<number | null>
  /**
   * Write to `ref` when possible; otherwise ask where to save, or download.
   * Returns the file now in use, or null when the user cancels.
   */
  save(ref: FileRef | null, text: string, suggestedName: string): Promise<{ ref: FileRef; lastModified: number } | null>
  download(name: string, text: string): void
}
