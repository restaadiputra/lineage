import { isMap, isSeq, LineCounter, parseDocument, type Document, type Node as YNode } from 'yaml'
import { FlowFile, type FlowNode } from './schema'
import { parsePath } from './paths'

export interface Diagnostic {
  message: string
  severity: 'error' | 'warning'
  /** 1-based line, when known */
  line?: number
  /** character offsets into the source, when known */
  from?: number
  to?: number
}

export interface ParseResult {
  flow: FlowFile | null
  diagnostics: Diagnostic[]
  /** node id → 1-based line where the node is defined */
  nodeLines: Record<string, number>
}

type PathKey = (string | number)[]

function locate(doc: Document, lc: LineCounter, path: PathKey) {
  // Walk up the path until we find something with a range
  for (let i = path.length; i >= 0; i--) {
    const node = doc.getIn(path.slice(0, i), true) as YNode | undefined
    if (node && typeof node === 'object' && 'range' in node && node.range) {
      const [from, to] = node.range
      return { line: lc.linePos(from).line, from, to }
    }
  }
  return {}
}

export function parseFlow(text: string): ParseResult {
  const lc = new LineCounter()
  const doc = parseDocument(text, { lineCounter: lc, prettyErrors: false })
  const diagnostics: Diagnostic[] = []
  const nodeLines: Record<string, number> = {}

  for (const e of doc.errors) {
    const from = e.pos[0]
    diagnostics.push({
      severity: 'error',
      message: e.message.split('\n')[0],
      line: lc.linePos(from).line,
      from,
      to: e.pos[1],
    })
  }
  if (doc.errors.length) return { flow: null, diagnostics, nodeLines }

  const raw = doc.toJS() ?? {}
  const parsed = FlowFile.safeParse(raw)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path as PathKey
      const where = path.length ? `${path.join('.')}: ` : ''
      diagnostics.push({ severity: 'error', message: where + issue.message, ...locate(doc, lc, path) })
    }
    return { flow: null, diagnostics, nodeLines }
  }

  const flow = parsed.data
  const nodesSeq = doc.get('nodes', true)
  if (isSeq(nodesSeq)) {
    nodesSeq.items.forEach((item, i) => {
      if (isMap(item) && item.range) {
        const id = flow.nodes[i]?.id
        if (id) nodeLines[id] = lc.linePos(item.range[0]).line
      }
    })
  }

  diagnostics.push(...validate(flow).map((v) => ({ ...v, ...locate(doc, lc, v.path) })))
  const hasError = diagnostics.some((d) => d.severity === 'error')
  return { flow: hasError ? null : flow, diagnostics, nodeLines }
}

interface SemanticIssue {
  message: string
  severity: 'error' | 'warning'
  path: PathKey
}

/** Checks the schema can't express: references, kinds, cycles. */
export function validate(flow: FlowFile): SemanticIssue[] {
  const issues: SemanticIssue[] = []
  const byId = new Map<string, FlowNode>()
  flow.nodes.forEach((n, i) => {
    if (byId.has(n.id)) issues.push({ severity: 'error', message: `Duplicate id "${n.id}"`, path: ['nodes', i, 'id'] })
    byId.set(n.id, n)
  })

  const expect = (id: string, kinds: string[], path: PathKey, role: string) => {
    const n = byId.get(id)
    if (!n) {
      issues.push({ severity: 'error', message: `${role} "${id}" is not defined in nodes`, path })
      return
    }
    if (!kinds.includes(n.kind))
      issues.push({ severity: 'error', message: `${role} "${id}" must be a ${kinds.join(' or ')}, not a ${n.kind}`, path })
  }
  const DATA = ['state', 'context', 'store', 'query']
  const checkPath = (p: string, path: PathKey) => expect(parsePath(p)[0], DATA, path, 'Data')

  flow.nodes.forEach((n, i) => {
    if (n.kind === 'state') expect(n.owner, ['component'], ['nodes', i, 'owner'], 'Owner')
    if (n.kind === 'context') expect(n.provider, ['component'], ['nodes', i, 'provider'], 'Provider')
    if (n.kind === 'effect') {
      expect(n.owner, ['component'], ['nodes', i, 'owner'], 'Owner')
      n.deps.forEach((d, j) => checkPath(d, ['nodes', i, 'deps', j]))
      n.sets.forEach((d, j) => checkPath(d, ['nodes', i, 'sets', j]))
    }
    if (n.kind === 'component')
      n.renders?.forEach((r, j) =>
        expect(typeof r === 'string' ? r : r.id, ['component'], ['nodes', i, 'renders', j], 'Child'),
      )
  })

  flow.edges.forEach((e, i) => {
    const at = (k: string): PathKey => ['edges', i, k]
    switch (e.kind) {
      case 'reads':
        expect(e.from, DATA, at('from'), 'Source')
        expect(e.to, ['component'], at('to'), 'Reader')
        break
      case 'prop':
        expect(e.from, ['component'], at('from'), 'Parent')
        expect(e.to, ['component'], at('to'), 'Child')
        if (e.data) checkPath(e.data, at('data'))
        break
      case 'writes':
      case 'mutates':
        expect(e.from, ['component', 'effect'], at('from'), 'Writer')
        expect(e.to, DATA, at('to'), 'Target')
        break
      case 'derives':
        expect(e.from, DATA, at('from'), 'Source')
        expect(e.to, DATA, at('to'), 'Target')
        break
    }
  })

  // A prop edge implies the parent renders the child — warn if renders is missing it.
  flow.edges.forEach((e, i) => {
    if (e.kind !== 'prop') return
    const parent = byId.get(e.from)
    if (parent?.kind !== 'component') return
    const kids = (parent.renders ?? []).map((r) => (typeof r === 'string' ? r : r.id))
    if (!kids.includes(e.to))
      issues.push({
        severity: 'warning',
        message: `"${e.from}" passes props to "${e.to}" but does not list it in renders`,
        path: ['edges', i],
      })
  })

  // Render cycles
  const children = (id: string) => {
    const n = byId.get(id)
    return n?.kind === 'component' ? (n.renders ?? []).map((r) => (typeof r === 'string' ? r : r.id)) : []
  }
  const state = new Map<string, 1 | 2>()
  const visit = (id: string, trail: string[]): void => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1) {
      const idx = flow.nodes.findIndex((n) => n.id === id)
      issues.push({
        severity: 'error',
        message: `Render cycle: ${[...trail.slice(trail.indexOf(id)), id].join(' → ')}`,
        path: ['nodes', idx],
      })
      return
    }
    state.set(id, 1)
    for (const c of children(id)) if (byId.has(c)) visit(c, [...trail, id])
    state.set(id, 2)
  }
  for (const n of flow.nodes) if (n.kind === 'component') visit(n.id, [])

  // Unknown ignore targets are only a warning
  flow.ignore.forEach((ig, i) => {
    if (ig.node && !byId.has(ig.node))
      issues.push({ severity: 'warning', message: `ignore: node "${ig.node}" not found`, path: ['ignore', i, 'node'] })
  })

  return issues
}
