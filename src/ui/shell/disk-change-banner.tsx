import { useFlow, useServices } from '../app-context'

/** Shown when another tool saved the file while the editor has unsaved edits. */
export function DiskChangeBanner() {
  const { files } = useServices()
  const changed = useFlow((s) => s.diskText !== null)
  const fileName = useFlow((s) => s.file?.name)
  if (!changed) return null

  return (
    <div className="banner" role="alert">
      <span>
        <strong>File changed on disk.</strong> {fileName} was edited by another tool, and you have unsaved changes here.
      </span>
      <span className="top-bar__spacer" />
      <button type="button" className="btn btn--outline" onClick={files.reloadFromDisk}>
        Reload
      </button>
      <button type="button" className="btn btn--outline" onClick={files.keepMine}>
        Keep mine
      </button>
    </div>
  )
}
