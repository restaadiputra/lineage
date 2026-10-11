/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Unit and component tests live next to the code; e2e/ belongs to Playwright.
    include: ['src/**/*.test.{ts,tsx}', 'vscode/src/**/*.test.ts'],
    // Vitest replaces CSS with an empty module unless told to load it; the token contrast test reads it.
    css: { include: /tokens\.css/ },
  },
})
