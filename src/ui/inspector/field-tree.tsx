import { formatPath } from '../../model/paths'
import type { DataNode } from '../../model/schema'
import { fieldTree, type FieldNode, type TypeTable } from '../../model/typeExpr'
import { useFlow } from '../app-context'
import { Section } from './parts'

interface FieldRowProps {
  field: FieldNode
  depth: number
  selectedPath: string | undefined
  onPick(fieldPath: string): void
}

function FieldRow({ field, depth, selectedPath, onPick }: FieldRowProps) {
  const fieldPath = formatPath(field.path)
  return (
    <>
      <li>
        <button
          type="button"
          className="field"
          style={{ paddingLeft: 8 + depth * 14 }}
          aria-pressed={fieldPath === selectedPath}
          onClick={() => onPick(fieldPath)}
        >
          <span className="field__name">{field.label}</span>
          <span className="field__type">{field.typeText}</span>
        </button>
      </li>
      {field.children.map((child) => (
        <FieldRow key={formatPath(child.path)} field={child} depth={depth + 1} selectedPath={selectedPath} onPick={onPick} />
      ))}
    </>
  )
}

/** The shape of a data node. Picking a field narrows the impact view to it. */
export function FieldTree({ node, types }: { node: DataNode; types: TypeTable }) {
  const selectedPath = useFlow((s) => (s.selection?.id === node.id ? s.selection.fieldPath : undefined))
  const select = useFlow((s) => s.select)
  const fields = fieldTree(node.type, types)
  if (fields.length === 0) return null

  return (
    <Section title="Fields">
      <ul className="fields">
        <li>
          <button
            type="button"
            className="field"
            style={{ paddingLeft: 8 }}
            aria-pressed={!selectedPath}
            onClick={() => select({ id: node.id })}
          >
            <span className="field__name">{node.id}</span>
            <span className="field__type">all of it</span>
          </button>
        </li>
        {fields.map((field) => (
          <FieldRow
            key={formatPath(field.path)}
            field={field}
            depth={1}
            selectedPath={selectedPath}
            onPick={(fieldPath) => select({ id: node.id, fieldPath })}
          />
        ))}
      </ul>
    </Section>
  )
}
