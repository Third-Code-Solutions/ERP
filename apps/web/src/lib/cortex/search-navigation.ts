export interface CortexSearchNavigableHit {
  href: string | null
}

/**
 * Move through only actionable Cortex results, wrapping at either edge.
 * Keeping this pure makes keyboard behavior deterministic and testable without
 * rendering the graph or touching the browser.
 */
export function nextCortexSearchIndex(
  current: number,
  hits: readonly CortexSearchNavigableHit[],
  direction: 1 | -1
): number {
  if (hits.length === 0 || !hits.some((hit) => hit.href)) return -1

  const start =
    current >= 0 && current < hits.length
      ? current
      : direction === 1
        ? -1
        : hits.length
  for (let offset = 1; offset <= hits.length; offset += 1) {
    const index = (start + direction * offset + hits.length * 2) % hits.length
    if (hits[index]?.href) return index
  }
  return -1
}

export function activeCortexSearchIndex(
  index: number,
  hits: readonly CortexSearchNavigableHit[]
): number {
  return index >= 0 && index < hits.length && Boolean(hits[index]?.href)
    ? index
    : -1
}
