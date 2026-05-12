'use client'

// US-011 — Variance banner: surfaces a warning at the top of the BomBuilder
// when the BOM TCV drifts more than 15% from the linked opportunity's
// forecast TCV. Pure presentational component; the parent decides whether
// to render it based on real data.

interface VarianceBannerProps {
  // Both in PHP centavos (matches the rest of the BOM stack).
  bomTcvCents: number
  forecastTcvCents: number | null | undefined
  // Threshold in percent. Default per US-011 is 15.
  thresholdPercent?: number
}

const DEFAULT_THRESHOLD = 15

export function VarianceBanner({
  bomTcvCents,
  forecastTcvCents,
  thresholdPercent = DEFAULT_THRESHOLD,
}: VarianceBannerProps) {
  // If we don't have a forecast value (legacy project, no linked opportunity,
  // forecast=0), there's nothing to compare against — render nothing.
  if (!forecastTcvCents || forecastTcvCents <= 0) return null

  const variancePercent = computeVariancePercent(bomTcvCents, forecastTcvCents)
  if (Math.abs(variancePercent) <= thresholdPercent) return null

  const above = bomTcvCents > forecastTcvCents
  const formattedPct = Math.abs(variancePercent).toFixed(1)

  return (
    <div
      role="status"
      aria-live="polite"
      className="stage-badge stage-negotiation"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        marginBottom: 12,
        fontSize: '0.8125rem',
        fontWeight: 500,
        // The .stage-badge default is inline-flex with a tiny padding —
        // we want a full-width banner, so override layout explicitly.
        width: '100%',
        justifyContent: 'flex-start',
        border: '1px solid color-mix(in oklch, #c2410c 30%, transparent)',
      }}
    >
      <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>
        ⚠
      </span>
      <span>
        BOE total is <strong style={{ fontFamily: 'var(--font-mono)' }}>{formattedPct}%</strong>{' '}
        {above ? 'above' : 'below'} the forecast cost. Review before submitting.
      </span>
    </div>
  )
}

// Exposed for unit testing and parent-side decisions.
export function computeVariancePercent(bomTcv: number, forecastTcv: number): number {
  if (forecastTcv <= 0) return 0
  // Signed: positive = BOM exceeds forecast, negative = below.
  return ((bomTcv - forecastTcv) / forecastTcv) * 100
}
