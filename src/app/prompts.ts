/**
 * Prompts for an external AI (Lineage itself has none built in). Each one
 * carries the whole format spec so it works in a chat that has never seen it.
 */

const FENCE = '```'
const fenced = (language: string, text: string) => `${FENCE}${language}\n${text.trimEnd()}\n${FENCE}`

/** Ask an AI to read code and describe it as a flow file. */
export function codeToDiagramPrompt(formatDoc: string): string {
  return [
    'Read the React code listed below and describe its data flow as a Lineage `.flow.yaml` file.',
    '',
    'Files to read: <list the files or folders here>',
    '',
    'Rules:',
    '- Follow the format specification below exactly. Do not invent fields.',
    '- Record what the code does, including its flaws. Do not fix or tidy the design.',
    '- Fill in `source` (file:line) for every node you can locate.',
    '- Reply with the YAML file only.',
    '',
    '---',
    '',
    formatDoc.trimEnd(),
    '',
  ].join('\n')
}

/** Ask an AI to implement the current diagram. */
export function diagramToCodePrompt(formatDoc: string, flowYaml: string): string {
  return [
    'Implement the React data flow described by the Lineage `.flow.yaml` file below.',
    '',
    'Rules:',
    '- Create every component, state, context, store, query and effect in the file, with the same names.',
    '- Data must move exactly as the edges say: same owners, same props, same readers and writers.',
    '- Entries under `ignore` are accepted trade-offs. Keep them as designed.',
    '- If the file is ambiguous, ask before guessing.',
    '',
    'The flow file:',
    '',
    fenced('yaml', flowYaml),
    '',
    '---',
    '',
    'The format specification, for reference:',
    '',
    formatDoc.trimEnd(),
    '',
  ].join('\n')
}
