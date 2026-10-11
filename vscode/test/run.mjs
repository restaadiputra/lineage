// Runs the extension inside a real VS Code and executes vscode/out/test/suite.js there.
// Usage: npm run test:vscode
import { runTests } from '@vscode/test-electron'
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const extensionDevelopmentPath = resolve(here, '..')
const repo = resolve(here, '..', '..')

// A throwaway workspace: the sample flow, and a shared layout file next to it.
const workspace = mkdtempSync(join(tmpdir(), 'lineage-vscode-'))
cpSync(join(repo, 'src', 'samples', 'orders.flow.yaml'), join(workspace, 'orders.flow.yaml'))
writeFileSync(
  join(workspace, 'orders.flow.layout.json'),
  JSON.stringify({ version: 1, flow: 'Orders dashboard', positions: { App: { x: 1234, y: 56 } } }, null, 2),
)

// A profile of its own, outside the workspace so the editor does not watch it.
const profile = mkdtempSync(join(tmpdir(), 'lineage-vscode-profile-'))

// Use the VS Code already on this machine when there is one; otherwise test-electron downloads a copy.
const installed = [
  process.env.LINEAGE_VSCODE_PATH,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
  '/usr/share/code/code',
].find((path) => path && existsSync(path))

try {
  await runTests({
    ...(installed ? { vscodeExecutablePath: installed } : {}),
    extensionDevelopmentPath,
    extensionTestsPath: join(extensionDevelopmentPath, 'out', 'test', 'suite.js'),
    // Its own profile, and no other extensions: the test must not depend on what the developer has installed.
    launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust', `--user-data-dir=${profile}`],
  })
  console.log('VS Code integration test passed')
} catch (error) {
  console.error('VS Code integration test failed:', error)
  process.exit(1)
}
