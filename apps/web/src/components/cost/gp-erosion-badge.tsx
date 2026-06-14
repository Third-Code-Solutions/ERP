import { erosionSeverity } from '@buildops/shared-types/cost'

/**
 * GP-erosion pill. Positive bps = GP eroding; <= 0 = intact / improved.
 * Color tracks severity (warn ≥ 5% of TCV, danger ≥ 15%). Works in grayscale
 * via the ▲ glyph + label, not hue alone (PRD §12.1).
 */
export function GpErosionBadge({ bps }: { bps: number }) {
  if (bps <= 0) {
    return (
      <span className="erosion-badge erosion-badge--intact">
        <span aria-hidden>●</span> GP intact
      </span>
    )
  }
  const sev = erosionSeverity(bps)
  const cls =
    sev === 'danger'
      ? 'erosion-badge--danger'
      : sev === 'warning'
        ? 'erosion-badge--warn'
        : 'erosion-badge--mild'
  return (
    <span className={`erosion-badge ${cls}`}>
      <span aria-hidden>▲</span> {(bps / 100).toFixed(1)}% eroded
    </span>
  )
}
