/**
 * Data paths: "orders[].items" → ["orders", "[]", "items"].
 * "[]" means "an element of this array".
 */
export type Path = string[]

export function parsePath(p: string): Path {
  const out: Path = []
  for (const part of p.split('.')) {
    const m = /^([^[\]]+)((?:\[\])*)$/.exec(part)
    if (!m) {
      if (/^(\[\])+$/.test(part)) for (let i = 0; i < part.length / 2; i++) out.push('[]')
      else out.push(part)
      continue
    }
    out.push(m[1])
    const n = m[2].length / 2
    for (let i = 0; i < n; i++) out.push('[]')
  }
  return out
}

export function formatPath(p: Path): string {
  let s = ''
  for (const seg of p) {
    if (seg === '[]') s += '[]'
    else s += (s ? '.' : '') + seg
  }
  return s
}

/**
 * Two paths overlap when one is a prefix of the other.
 * With immutable updates, changing orders[].status creates a new `orders`
 * array (prefix) but leaves orders[].items untouched (sibling).
 */
export function overlaps(a: Path, b: Path): boolean {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false
  return true
}

export function startsWith(p: Path, prefix: Path): boolean {
  if (prefix.length > p.length) return false
  return prefix.every((seg, i) => p[i] === seg)
}

export const rootOf = (p: string): string => parsePath(p)[0]
