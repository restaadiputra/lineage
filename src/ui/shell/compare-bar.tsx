import { differenceCount } from '../../app/comparison'
import { useFlow } from '../app-context'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Shown while comparing: what is being compared, how much differs, and the way out. */
export function CompareBar() {
  const comparison = useFlow((s) => s.comparison)
  const stopComparing = useFlow((s) => s.stopComparing)
  if (!comparison) return null
  const { diff, fileName } = comparison
  const { counts } = diff

  return (
    <div className="banner banner--compare" role="region" aria-label="Comparison">
      <span>
        <strong>Comparing plan and code.</strong> The code is <code>{fileName}</code>.{' '}
        {differenceCount(diff) === 0
          ? 'No differences.'
          : `${plural(counts['plan-only'], 'item')} only in the plan, ${counts['code-only']} only in the code, ${counts.changed} changed.`}
      </span>
      <span className="top-bar__spacer" />
      <button type="button" className="btn btn--outline" onClick={stopComparing}>
        Stop comparing
      </button>
    </div>
  )
}
