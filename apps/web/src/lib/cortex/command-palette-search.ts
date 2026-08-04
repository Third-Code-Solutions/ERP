export interface CortexPaletteSearchResponseHit {
  id: string
  label: string
  title: string
  summary: string | null
  href: string | null
  freshness: string
}

export interface CortexPaletteHit {
  type: 'cortex'
  id: string
  label: string
  title: string
  summary: string | null
  href: string
  freshness: string
}

/** Keep command-palette results actionable and presentation-safe. */
export function normalizeCortexPaletteHits(
  hits: readonly CortexPaletteSearchResponseHit[]
): CortexPaletteHit[] {
  return hits.flatMap<CortexPaletteHit>((hit) => {
    if (typeof hit.href !== 'string' || hit.href.length === 0) return []

    return [
      {
        type: 'cortex',
        id: hit.id,
        label: hit.label.trim() || 'Cortex source',
        title: hit.title.trim() || hit.label.trim() || 'Cortex source',
        summary: hit.summary?.trim() || null,
        href: hit.href,
        freshness: hit.freshness,
      },
    ]
  })
}
