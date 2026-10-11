import { useEffect } from 'react'
import { useFlow } from '../app-context'

/** Mirrors the theme setting onto <html data-theme>; "system" leaves it to the OS. */
export function useTheme(): void {
  const theme = useFlow((s) => s.settings.theme)
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  }, [theme])
}
