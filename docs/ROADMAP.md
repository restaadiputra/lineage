# Lineage: where it stands and what could come next

Implementation is **paused as of 2026-10-11**. Everything in the version 1 spec and all five items of the first
roadmap are built and tested. This file lists what exists and what was left out, with enough context to pick any
item up later. `CLAUDE.md` describes the architecture and conventions; read it first.

## What is built

| Area | What works |
|---|---|
| Engine | Format and schema, parser with line-mapped diagnostics, impact and re-render simulation, 13 rules, ignore list. Routes include props that carry cascaded data. |
| Shell | Top bar, three resizable panels, status bar, light / dark / system theme, settings and YAML remembered between sessions. |
| YAML editor | Debounced re-parse, error marks, last valid diagram kept while the YAML is broken, selected node's line highlighted. |
| Canvas | Auto-layout, one shape per node kind, problem badges, edge filters, saved positions, Re-layout, Fit all, readable opening zoom. |
| Impact view | Selecting data lights up readers, writers, carriers, cascade and re-renders; selecting a component or effect shows its neighbours. |
| Inspector | Details per node kind with a field tree that narrows the impact; Problems tab with fixes and "Ignore" written into the YAML. |
| Search and shortcuts | Ctrl/Cmd+K search; Ctrl/Cmd+O, S, E; N and C on the canvas; Esc. |
| Files | Open, Save, drag and drop, and watching the open file with a "Reload / Keep mine" banner. |
| Ask AI | Two copy-prompt items and Download FORMAT.md. |
| Flow menu | New flow, load the sample, compare, layout export / import, code folder. |
| Layout file | Export and import `.flow.layout.json`, or drop it on the window. |
| Plan versus code | Merged diagram with plan-only, code-only and changed marks, a Compare tab, live update as the plan is edited. |
| Canvas editing | Add node (N) and Connect (C) dialogs that splice the change into the YAML without reformatting the rest. |
| Code reader | Reads a folder of React source without AI, to compare against the open flow or to start a new one. |
| VS Code extension | Custom editor for `*.flow.yaml`, two-way sync with the text document, rule problems in the Problems panel, go-to-source, sibling layout file applied on open. |

Tests at the time of pausing: 349 unit and component tests (`npm test`), 106 end-to-end tests across Chromium,
Firefox and WebKit (`npm run test:e2e`), and a 7-step run inside a real VS Code (`npm run test:vscode`).

## Future features

Each item says what is missing, why it matters, and where the work would start. They are grouped by feature, not
ordered by priority.

### Canvas editing

| Missing | Notes for whoever builds it |
|---|---|
| Delete a node or an edge | The hard part is the YAML: removing a node must also remove it from every `renders`, `deps`, `sets`, `owner` and edge that names it, as text splices. `src/app/yaml-list.ts` only appends today; it needs a "remove item" counterpart with the same no-reformat guarantee. |
| Rename a node | Same reach as delete: every reference has to change. Positions are keyed by id (`position-repository.ts`), so the saved position must move with the name. |
| Edit fields of an existing node or edge (type, owner, `via`, `fields`, `used`, `stable`) | Needs "set a scalar inside a node/edge" in `yaml-list.ts`, then forms in the inspector's Details tab. |
| Drag from one node to another to connect | React Flow supports it (`nodesConnectable`, handles are already rendered but hidden). On drop, open the Connect dialog's second step with both nodes chosen (`relationsBetween` in `src/app/connect.ts`). |
| Editing while comparing | Off by design (`applyEdits` refuses). Would need a decision about which side an edit applies to. |

### Code reader (`src/reader`)

| Missing | Notes |
|---|---|
| Custom hooks | FORMAT.md says state inside a custom hook belongs to the calling component, with a note naming the hook. The reader records a skip instead. Would mean reading the hook's body with the caller as owner and mapping its return value to the caller's bindings (`hooks.ts`). |
| Redux, Jotai, MobX, RTK Query, Apollo | Only zustand `create`, `useQuery` and `useSWR` are recognised (`collect.ts`, `hooks.ts`). Each library needs its own store detection and read / write patterns. |
| Spread props (`<Child {...props} />`) | Skipped with a note (`jsx.ts`). |
| Import resolution | Everything is matched by name. Two components with the same name in different files, or `import { A as B }`, confuse it. ts-morph can resolve symbols, at the cost of loading more of the project. |
| Effect names | Generated from what the effect sets (`syncTotal`), so they rarely match names a person or an AI chose and show up as differences when comparing. A fuzzy match on owner + deps + sets in `compareFlows` would remove that noise. |
| Proof on a real codebase | Only run on `fixtures/orders-app` and small inline snippets. Expect new patterns to surface. |
| `updates:` hints, `note:` fields | Never written by the reader. |

### Plan versus code

| Missing | Notes |
|---|---|
| Watch the compared file | It is read once (`compare-session.ts`). The open file is already watched by `file-session.ts`; the same polling could re-run `compareWith`. In VS Code this could use the document change events instead. |
| Swap which side is the plan | The open flow is always the plan. |
| Problems and status bar for the code side | Both describe the plan only while comparing. |
| Less noise from code-level facts | `used: false`, `stable: false` and `mutates` edges are real differences but drown an early plan. A toggle "ignore code-level facts" in `compareFlows` would help; `Problem.codeLevel` in the rules already marks the same idea. |
| Copy a difference into the plan | "Accept" a code-only node or edge into the YAML, using `applyEdits`. |

### VS Code extension (`vscode/`)

| Missing | Notes |
|---|---|
| Publishing | `publisher` in `vscode/package.json` is a placeholder; there is no icon, no repository field and no license. `npx @vscode/vsce package --no-dependencies` already produces a working `.vsix` (about 2.4 MB). |
| Write moved positions back to the layout file | Positions are kept in VS Code's workspace state. "Export layout…" writes the file by hand. Writing automatically (when the file already exists) would make layouts truly shared. |
| Automated clicks inside the webview in real VS Code | Canvas edits, Save and dialogs are tested against a stand-in host (`e2e/vscode-webview.spec.ts`), not the real editor. |
| Status bar item, "compare with the code in this workspace" command | The webview already reports node and problem counts (`status` message). |
| Use the document events to watch a compared file | See plan versus code. |

### General

| Missing | Notes |
|---|---|
| Whole sample visible at 1280px | With both side panels open the sample opens at 75% zoom with some nodes off-screen (`src/canvas/viewport.ts`, `READABLE_ZOOM`). Measured: no ELK setting gets the 21-node sample narrower than about 930px at that zoom, against a 658px canvas. A real fix needs a different layout idea (owned data stacked beside its owner, or collapsible subtrees), not tuning. |
| Layout file loaded automatically in the browser | A browser cannot read the file next to an opened flow. Only the VS Code extension does this. A folder handle (`showDirectoryPicker`) would allow it in Chromium. |
| Native Open and Save dialogs under test | They cannot be automated in any browser; the code paths around them are tested with fallbacks and in-memory handles. |
| Minimap or overview | Would help with the cropped opening view. The design direction says no floating cards, so it needs a place in the layout. |
| Flow name menu | Its contents (New flow, Load the sample, compare, layout, code folder) were chosen during implementation; the original spec did not define them. |
| Smaller downloads | The code reader chunk is about 6.6 MB (TypeScript compiler) and ELK 1.4 MB. Both load lazily. |

## Known decisions worth knowing before changing things

- **YAML is edited by splicing text**, never by re-serialising the document, because the YAML library re-pads every
  inline list. Any new write-back feature should go through `src/app/yaml-list.ts`.
- **Colors mean something**: blue = selected data and plan-only, green = reads and code-only, orange = writes,
  amber = warnings and changed, violet = re-render. `src/styles/tokens.test.ts` enforces contrast for every token.
- **The app must stay offline.** The e2e fixture fails any test whose page requests something from another origin.
- **Dependencies point inward**: `model`, `analysis` ← `app`, `canvas`, `reader` ← `adapters`, `ui` ← the entry
  points (`main.tsx`, `vscode/webview-main.tsx`). New behaviour starts as a pure, tested function.
