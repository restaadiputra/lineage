# Lineage

A diagram tool for React data flow. A `.flow.yaml` file describes components,
state, context, stores, queries, effects and how data moves between them.
Lineage draws it, simulates re-renders, shows the impact of changing any field,
and checks the design against React rules.

It is used in two directions:
- **Before coding**: draw/write the plan, fix rule warnings, export it as a
  prompt for an AI to implement.
- **After coding**: an AI (any — often GitHub Copilot) reads code and writes the
  `.flow.yaml` using `docs/FORMAT.md`; Lineage draws it so a human can
  understand the flow and spot problems.

The app has **no AI built in** and must work fully offline (no CDNs, no network
calls). Fonts are bundled from `@fontsource-variable/*`.

## Commands

```
npm install
npm run dev        # Vite dev server
npm test           # vitest: engine, application layer and React component tests (jsdom)
npm run test:e2e   # Playwright (Chromium, Firefox, WebKit) at 1280x800, against the production build on port 5180
npm run build      # tsc -b && vite build
npm run lint       # oxlint
```

## Architecture

```
docs/FORMAT.md              Format spec written for the AI. Keep in sync with schema.ts.
src/model/schema.ts         zod schema for the flow file (source of truth for the format)
src/model/parse.ts          YAML → FlowFile, diagnostics with line numbers, semantic validation, nodeLines
src/model/graph.ts          Graph indexes (children, parents, props, edges, owners), LCA helpers, edgeKey()
src/model/paths.ts          Data paths: "orders[].items" ↔ ["orders","[]","items"], overlaps()
src/model/typeExpr.ts       Tiny TS type reader + fieldTree() for the impact field picker
src/analysis/impact.ts      computeImpact(): readers, carriers, writers, cascade, re-render simulation
                            computeComponentFocus(): a component's parents, children, data
src/analysis/rules.ts       runRules() → Problem[], RULES metadata, applyIgnores()
src/analysis/compare.ts     compareFlows() → FlowDiff (plan vs code), mergeFlows() for the merged diagram
src/analysis/analysis.test.ts
src/samples/orders.flow.yaml  Sample with deliberate flaws (exercises every rule)

src/app/                    Application layer (no React, no browser globals; all tested)
  ports.ts                  KeyValueStore, Clipboard, FileGateway interfaces
  flow-store.ts             zustand store: yaml, diagnostics, last valid flow, selection, settings, file state
  analyze.ts                YAML text → diagnostics + graph + problems
  file-session.ts           Open / save / watch the file on disk (reload or "keep mine")
  yaml-list.ts              Adds items to lists in the YAML text without reformatting the file
  edit-flow.ts              FlowEdit (node / edge / list item), Add node draft and validation
  connect.ts                relationsBetween(): the ways two nodes can be connected
  append-ignore.ts          Adds an entry to `ignore:` (uses yaml-list)
  layout-file.ts            `.flow.layout.json` format; layout-exchange.ts exports / imports it
  comparison.ts             Comparison = code flow + diff + merged graph; compare-session.ts picks the code file
  code-session.ts           Reads a code folder through the CodeReader port: compare with it, or start from it
  search.ts, prompts.ts, settings.ts, position-repository.ts, describe-component.ts,
  new-flow.ts, file-names.ts
src/canvas/                 Pure canvas model: view-edges, focus (impact → roles), diff-view (plan vs code),
                            layout (ELK), node-size, edge-geometry, badges, viewport
src/reader/                 Code reader: React source → flow file, without AI (ts-morph; loaded lazily)
  read-code.ts              readCode(files, name): collect → hooks → jsx → calls → emit
  source-files.ts           Input / output types and isReadable(); safe to import without the compiler
fixtures/orders-app/        The sample as real React code; input for the reader's tests. Not compiled or linted.
src/adapters/               Browser implementations of the ports (localStorage, clipboard, files, lazy code reader)
src/ui/                     React: shell/ (top bar, status bar, search, menus), editor/, canvas/, inspector/,
                            editing/ (Add node and Connect dialogs)
src/main.tsx                Composition root: the only place that picks adapters
```

Engine rules (pure functions, all tested):
mutation, effect-loop, prop-drilling, derived-state, server-state-copy,
effect-chain, effect-derived-state, unstable-memo-prop, busy-context, list-key,
state-too-high, whole-store, duplicate-state.

Key semantics:
- Paths overlap when one is a prefix of the other (immutable updates: changing
  `orders[].status` changes `orders`, not `orders[].items`).
- Re-render simulation: changed state → owner re-renders; context/store/query
  readers re-render if their `fields` overlap; children of a re-rendering
  component re-render unless `memo` and no prop carries changed data and no prop
  is `stable: false`.
- When the YAML is invalid, keep showing the last valid graph plus the errors.

## Status

Done: engine (format, parser, graph, impact, 13 rules) and the version 1 UI
described below, steps 1 to 11.

Tests:
- `src/**/*.test.ts`: engine, application layer and pure canvas model (node).
- `src/**/*.test.tsx`: React components in jsdom, rendered through
  `src/testing/render-app.tsx` with in-memory adapters. They start with
  `// @vitest-environment jsdom`. jsdom has no layout, so React Flow rendering
  and editor typing are left to Playwright.
- `e2e/*.spec.ts`: Playwright, in Chromium, Firefox and WebKit, against the
  production build. The `app` fixture loads the sample and fails a test when
  the browser console has an error or warning, or when the page requests
  anything from another origin (the offline guarantee). File tests use the
  upload/download fallback and, in Chromium, real handles from the browser's
  private file system, because native file pickers cannot be automated. First
  run needs `npx playwright install`.
- `src/styles/tokens.test.ts` checks every color token for contrast (4.5:1 for
  text tokens, 3:1 for line tokens) and that the two dark blocks match.

Dependencies point inward: model/analysis ← app and canvas ← adapters and ui ←
main.tsx. New UI behaviour goes into `src/app` or `src/canvas` as a pure,
tested function first; components stay thin.

## Version 1 UI (built; this is the spec it follows)

1. **Shell + store** (zustand): yaml text, last valid ParseResult + Graph,
   problems, selection `{ id, fieldPath? }`, edge filters, theme, panel sizes.
   Re-parse on edit, debounced ~250 ms. Load the sample on first run; persist
   the last YAML in localStorage.
2. **YAML editor** (left, resizable, collapsible): `@uiw/react-codemirror` +
   `@codemirror/lang-yaml` + `@codemirror/lint` fed from diagnostics. Selecting
   a node on the canvas scrolls the editor to `nodeLines[id]` and highlights it.
3. **Canvas** (center): `@xyflow/react`.
   - Layout with `elkjs/lib/elk.bundled.js`, layered, direction DOWN. Layout
     edges: renders, owner→state/effect, provider→context, data→reader, derives.
     Not prop or writes edges.
   - Positions persisted in localStorage keyed by flow `name` + node id, never
     in the YAML. "Re-layout" button resets.
   - Edges drawn: one tree edge per parent→child pair (prop names shown as a
     label only when highlighted), ownership (dotted, short), reads (solid),
     writes (dashed), mutates (dashed, error color), derives (dotted).
     Filter toggles for tree / reads / writes / ownership.
   - Node badges: problem count with severity color.
4. **Focus + impact**: click a data node → `computeImpact`; color source,
   readers, writers, carriers, re-renders; dim everything else. Click a component
   → `computeComponentFocus`. Esc clears. Legend in the inspector.
5. **Inspector** (right, tab "Details"): per kind. Data nodes get the field tree
   (click a field to narrow impact) and lists of readers / writers / carriers /
   re-renders / skipped-by-memo, each with its reason. Components get props,
   received props (with `data`, used, stable), reads, writes, children, parents.
   Show `source` with a copy button.
6. **Problems** (right, tab): grouped by severity, click selects and pans to
   the node, expandable fix text, "Ignore" with an inline reason field that
   appends `{ rule, node, reason }` to `ignore:` using the `yaml` Document API
   (preserve comments). Ignored items listed collapsed at the bottom.
7. **Search** (Ctrl/Cmd+K): find a node by id, Enter selects and pans to it.
8. **Files**: Open / Save via the File System Access API (Chrome/Edge) with
   **watching**: poll `getFile().lastModified` every second and reload when an
   external tool (Copilot) edits the file; if the editor has unsaved changes,
   show a banner "File changed on disk — Reload / Keep mine". Fallback: upload
   input + download. Drag and drop a file onto the window.
9. **Ask AI menu**: "Copy prompt: code → diagram" (FORMAT.md + "Read <files>
   and write a .flow.yaml"), "Copy prompt: diagram → code" (FORMAT.md + the
   current YAML), "Download FORMAT.md". Import FORMAT.md with `?raw`.
10. **Status bar**: valid / n errors, node and edge counts, problem counts.
    Shortcuts: Ctrl/Cmd+O open, Ctrl/Cmd+S save, Ctrl/Cmd+E toggle editor,
    Ctrl/Cmd+K search, Esc clear selection. Theme: system / light / dark.
11. **Verify**: Playwright screenshots (Chromium is at /opt/pw-browsers if
    running in the cloud sandbox) in light and dark, with impact mode on
    `orders`; check the browser console is clean.

## Design direction: modern minimalism, practical

The canvas is the product. Chrome stays quiet; color appears only when it
carries meaning. The one memorable element is the impact view: when a data node
is selected, its routes light up in color like lines on a transit map while
everything else fades to grey.

Layout (left aligned, full-bleed panels separated by hairlines, no floating cards):
```
┌ Lineage  Orders dashboard ▾ │ Open  Save │ Ask AI ▾ │ ⌘K Search │ ◐ ┐   (▾ on the name: New flow / Load the sample)
├─ YAML ───────┬──────────── canvas ────────────┬─ Details | Problems ─┤
│ editor       │                                │ inspector            │
│ (collapsible)│                                │                      │
└──────────────┴────────────────────────────────┴──────────────────────┘
  Valid · 22 nodes · 31 edges · 2 errors · 7 warnings     (status bar)
```

Tokens (define as CSS custom properties on `:root`, dark under
`[data-theme="dark"]` and `prefers-color-scheme`):

| Token | Light | Dark | Use |
|---|---|---|---|
| canvas | #F3F5F4 | #121614 | canvas background |
| surface | #FFFFFF | #1A1F1D | panels, nodes |
| ink | #17201C | #E4E9E6 | text |
| muted | #66706B | #8E9893 | secondary text |
| hairline | #DCE1DE | #2A322E | panel borders, dimmed edges |
| line | #848C88 | #757F7A | idle node borders and edges (3:1 on canvas) |
| source | #2F55D4 | #7C97FF | selected data, focus ring |
| reader | #0F8A6C | #3CC8A0 | reads |
| writer | #D9480F | #FF8A4C | writes |
| rerender | #7C3AED | #A98BFF | re-render outline |
| error / warning / info | #C8323F / #B7791F / #4F6B8A | #F26B76 / #E0A84A / #8FA8C8 | problems |
| reader-text / writer-text / warning-text | #0B7259 / #B83C0B / #8A5A12 | same as base | those three as small text (base colors are below AA on white) |

Type: Instrument Sans Variable for UI (13px base; scale 12 / 13 / 15 / 18,
weights 400/500/600). JetBrains Mono Variable only for code identifiers
(prop names, types, paths, YAML). Sentence case everywhere; no all-caps labels,
no `→` appended to buttons.

Shape encodes node kind (color is reserved for meaning):
component = rectangle, 6px radius, name + up to 6 props in mono;
state = capsule; context = capsule with double border; store = rectangle with
a 3px left rule; query = rectangle with dashed border; effect = small tag.
Kind shown as a muted word (`useState`, `zustand`, `react-query`), not a chip.

Quality floor: visible keyboard focus, `prefers-reduced-motion` respected, works
at 1280px wide, contrast AA. Motion only in response to actions (selection
fade, pan to node).

## Roadmap after v1
- ~~Canvas editing (keyboard-first add node / connect), writing back to YAML~~ Done for adding:
  N (or the toolbar) opens Add node: kind, id, owner / type / parent as the kind needs. C connects the selected
  node: pick the other node, then one of the relations valid for that pair (renders, prop, reads, writes,
  derives, effect deps / sets). Edits are spliced into the YAML text in the style around them, never by
  re-serialising the file; an edit that would make the flow invalid is refused. Ctrl+Z in the editor undoes.
  Not done: deleting, renaming, editing fields of an existing node or edge, drag-to-connect. Those are still
  YAML-only.
- ~~Plan vs code comparison (diff two flow files)~~ Done: flow menu → Compare with code… opens a second flow
  file. The open flow is "the plan", the second file "the code". Both are drawn as one merged diagram: nodes and
  edges are tagged plan only (blue, dashed), code only (green) or changed (amber); a Compare tab lists every
  difference and pans to it. The impact view is off while comparing. `source` and `note` are never differences.
  Render links and effect deps/sets are compared as edges. The comparison is redone when the plan is edited;
  the code file is read once, not watched.
- ~~Built-in code reader with ts-morph (no AI) to cross-check AI output~~ Done: flow menu → Compare with a code
  folder… (reads the folder, then runs the plan-vs-code comparison) and New flow from a code folder…. The reader
  (`src/reader`) runs in the browser on an in-memory ts-morph project; nothing leaves the machine. It is loaded
  on first use as its own ~7 MB chunk. It is static and name-based: it recognises components, useState /
  useReducer / useRef, createContext + Provider, zustand `create`, useQuery / useSWR, effects, JSX children
  and props, and traces props back to their data through renames, `props.x` and `.map()` callbacks. It records
  what it skipped (custom hooks, spread props, unprovided contexts) as notes, shown in the Compare tab and as
  comments at the top of the generated YAML. Not handled: custom hooks, Redux / Jotai / MobX, imports that
  rename things, components with the same name in two files.
- ~~Layout file export (`.flow.layout.json`) for sharing positions in the repo~~ Done: flow menu → Export layout… /
  Import layout…, or drop the file on the window. Format: `{ version: 1, flow, positions: { id: { x, y } } }`,
  ids sorted and coordinates rounded so it diffs cleanly. Import keeps positions of nodes the file does not name.
  The browser cannot read the file next to an opened flow by itself, so loading it is a manual step.
- VS Code extension wrapper
