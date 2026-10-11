import type { FileGateway, FileRef, TextFile } from '../app/ports'

/** A one-file disk that tests can edit behind the app's back. */
export function fakeDisk(text: string, name = 'orders.flow.yaml') {
  const ref: FileRef = { name, handle: {} }
  const disk = {
    text,
    lastModified: 1,
    cancelled: false,
    downloads: [] as string[],
    /** what openText() hands back: the "other" file a test puts on the disk */
    other: null as TextFile | null,
    /** everything saved through saveText() */
    savedTexts: [] as TextFile[],
  }
  const opened = () => ({ ref, text: disk.text, lastModified: disk.lastModified })

  const files: FileGateway = {
    open: async () => (disk.cancelled ? null : opened()),
    fromDrop: async () => opened(),
    read: async () => opened(),
    lastModified: async () => disk.lastModified,
    async save(_ref, saved) {
      disk.text = saved
      disk.lastModified += 1
      return { ref, lastModified: disk.lastModified }
    },
    download: (downloadName) => void disk.downloads.push(downloadName),
    openText: async () => (disk.cancelled ? null : disk.other),
    async saveText(file) {
      if (disk.cancelled) return false
      disk.savedTexts.push(file)
      return true
    },
  }

  /** Change the file as another tool (Copilot, an editor) would. */
  const edit = (next: string) => {
    disk.text = next
    disk.lastModified += 1
  }
  return { files, disk, edit }
}
