import { defineConfig, devices } from '@playwright/test'

// Its own port, so a dev server you already have open on 5173 is left alone.
const PORT = 5180
const URL = `http://localhost:${PORT}`
const WEBVIEW_PORT = 5181

// 1280px wide is the smallest window the design promises to work at.
const viewport = { width: 1280, height: 800 }

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
    // Firefox and Safari have no File System Access API: they exercise the upload/download fallback for real.
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } },
  ],
  webServer: [
    {
      // The production build, not the dev server: this is what ships, and it must work with no network.
      command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
      url: URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // The VS Code webview bundle, for e2e/vscode-webview.spec.ts.
      command: `npm run build:webview && npx vite preview --config vite.webview.config.ts --port ${WEBVIEW_PORT} --strictPort`,
      url: `http://localhost:${WEBVIEW_PORT}/webview.html`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
