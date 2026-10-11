import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Lineage app built for the VS Code webview: same UI, a different entry point (src/vscode/webview-main.tsx).
export default defineConfig({
  plugins: [react()],
  // Relative URLs: the files are loaded from wherever the extension is installed.
  base: './',
  build: {
    outDir: 'vscode/media',
    emptyOutDir: true,
    // The extension reads the manifest to find the entry script and stylesheet by their hashed names.
    manifest: true,
    // Never inline assets as data: URLs. The extension page's security policy only allows files from the
    // extension folder, and small font files would otherwise be inlined and then blocked.
    assetsInlineLimit: 0,
    rollupOptions: { input: 'webview.html' },
  },
})
