import { useEffect, useState } from 'react'
import { useServices } from '../app-context'

/** Polls the open file for edits made by other tools while the app is mounted. */
export function useFileWatch(): void {
  const { files } = useServices()
  useEffect(() => files.startWatching(), [files])
}

const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files')

/** Opens a file dropped anywhere on the window. Returns true while a file is dragged over it. */
export function useFileDrop(): boolean {
  const { files } = useServices()
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      // Without this the browser navigates to the dropped file.
      event.preventDefault()
      setDragging(true)
    }
    const onDragLeave = (event: DragEvent) => {
      // relatedTarget is null only when the pointer leaves the window.
      if (!event.relatedTarget) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event) || !event.dataTransfer) return
      event.preventDefault()
      setDragging(false)
      void files.openDropped(event.dataTransfer)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [files])

  return dragging
}
