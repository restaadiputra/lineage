import { create } from 'zustand'
import type { UIState } from '../types'

export const useUiStore = create<UIState>()(() => ({
  theme: 'light',
  sidebarOpen: true,
}))
