import type { MonthlyForecastData } from '@/lib/dashboard-queries'

interface ForecastChartProps {
  data: MonthlyForecastData
}

const CHART_W = 720
const CHART_H = 240
const PADDING = { top: 16, right: 16, bottom: 36, left: 56 }

function hashHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 360
}

function formatPhpCompact(cents: number): string {
  const v = cents / 100
  if (v >= 1_000_000_000) return `₱${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `₱${(v / 1_000).toFixed(0)}k`
  return `₱${v.toFixed(0)}`
}

function formatMonthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
  return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
}

export function ForecastChart({ data }: ForecastChartProps) {
  const reps = Object.keys(data.byRep)
  const innerW = CHART_W - PADDING.left - PADDING.right
  const innerH = CHART_H - PADDING.top - PADDING.bottom

  // Compute max across all rep series.
  const maxValue = reps.reduce(
    (max, repId) => Math.max(max, ...(data.byRep[repId] ?? [])),
    0
  )

  // 5 horizontal grid steps, anchored to a "nice" round value.
  function niceMax(v: number): number {
    if (v <= 0) return 100
    const pow = Math.pow(10, Math.floor(Math.log10(v)))
    const norm = v / pow
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
    return nice * pow
  }
  const yMax = niceMax(maxValue)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => p * yMax)

  function xFor(i: number): number {
    if (data.months.length <= 1) return PADDING.left + innerW / 2
    return PADDING.left + (i / (data.months.length - 1)) * innerW
  }
  function yFor(v: number): number {
    if (yMax === 0) return PADDING.top + innerH
    return PADDING.top + innerH - (v / yMax) * innerH
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Forecast (Weighted TCV)</h2>
          <p className="card-subtitle">
            Next {data.months.length} months by sales rep, weighted by stage probability
          </p>
        </div>
      </div>

      {reps.length === 0 ? (
        <div className="card-empty">
          No opportunities with closing dates in the next {data.months.length} months.
        </div>
      ) : (
        <div style={{ padding: 18 }}>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Monthly weighted TCV forecast by sales rep"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          >
            {/* gridlines + y labels */}
            {yTicks.map((t) => {
              const y = yFor(t)
              return (
                <g key={t}>
                  <line
                    x1={PADDING.left}
                    x2={CHART_W - PADDING.right}
                    y1={y}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeWidth={1}
                  />
                  <text
                    x={PADDING.left - 8}
                    y={y + 4}
                    fontSize={11}
                    textAnchor="end"
                    fill="#6b7280"
                    fontFamily="JetBrains Mono, ui-monospace, monospace"
                  >
                    {formatPhpCompact(t)}
                  </text>
                </g>
              )
            })}

            {/* x labels */}
            {data.months.map((m, i) => (
              <text
                key={m}
                x={xFor(i)}
                y={CHART_H - PADDING.bottom + 18}
                fontSize={11}
                textAnchor="middle"
                fill="#6b7280"
              >
                {formatMonthLabel(m)}
              </text>
            ))}

            {/* rep series */}
            {reps.map((repId) => {
              const values = data.byRep[repId] ?? []
              const stroke = `hsl(${hashHue(repId)}, 65%, 45%)`
              const points = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ')
              return (
                <g key={repId}>
                  <polyline
                    fill="none"
                    stroke={stroke}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                  />
                  {values.map((v, i) => (
                    <circle
                      key={i}
                      cx={xFor(i)}
                      cy={yFor(v)}
                      r={3}
                      fill={stroke}
                    >
                      <title>{`${data.repLabels[repId] ?? repId} — ${formatMonthLabel(data.months[i] ?? '')}: ${formatPhpCompact(v)}`}</title>
                    </circle>
                  ))}
                </g>
              )
            })}
          </svg>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px 18px',
              marginTop: 12,
              fontSize: 12,
            }}
          >
            {reps.map((repId) => (
              <span
                key={repId}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: `hsl(${hashHue(repId)}, 65%, 45%)`,
                  }}
                />
                <span style={{ color: 'var(--color-neutral-700, #404040)' }}>
                  {data.repLabels[repId] ?? repId}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
