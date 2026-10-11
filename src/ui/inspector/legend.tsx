import { Section } from './parts'

const SHAPES = [
  ['Component', 'component'],
  ['State', 'state'],
  ['Context', 'context'],
  ['Store', 'store'],
  ['Query', 'query'],
  ['Effect', 'effect'],
] as const

/** Key for the node shapes, shown while nothing is selected. */
export function ShapeLegend() {
  return (
    <Section title="Shapes">
      <ul className="legend">
        {SHAPES.map(([label, shape]) => (
          <li key={shape}>
            <span className={`lg-node lg-node--${shape} legend__swatch`} />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
