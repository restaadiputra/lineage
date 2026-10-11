# Lineage

See how data flows through a React feature: who owns it, who reads it, who
changes it, what re-renders when it changes, and which React rules the design
breaks.

- Write or generate a `.flow.yaml` file (format: [docs/FORMAT.md](docs/FORMAT.md)).
- Give `docs/FORMAT.md` to any AI to turn existing code into a flow file, or to
  turn a flow file into code.
- Runs fully offline; no AI inside the app.

```
npm install
npm test
npm run dev
```

What is built and what could come next: [docs/ROADMAP.md](docs/ROADMAP.md).
Architecture and conventions: [CLAUDE.md](CLAUDE.md). VS Code extension: [vscode/README.md](vscode/README.md).
