/**
 * S-Curve chart (pure SVG, no chart lib).
 *
 * Plots two cumulative-% curves on a 0-100 Y axis vs week index on X:
 *   - planned (navy)
 *   - actual (gold)
 *
 * Includes light 25% gridlines, axis labels, legend, and a status chip
 * describing schedule variance.
 *
 * Inputs are optional — when both planned + actual are empty we render an
 * unobtrusive placeholder rather than a broken-looking chart.
 */

interface SCurveChartProps {
  planned: number[]
  actual: number[]
  /** Optional override; defaults to actual.length - 1 (last reported week). */
  currentWeekIndex?: number
}

const W = 720
const H = 320
const PAD_L = 44
const PAD_R = 16
const PAD_T = 16
const PAD_B = 36
const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

function buildPath(values: number[], weekCount: number): string {
  if (values.length === 0 || weekCount <= 1) return ''
  const step = PLOT_W / (weekCount - 1)
  return values
    .map((v, i) => {
      const x = PAD_L + i * step
      const y = PAD_T + PLOT_H * (1 - Math.max(0, Math.min(100, v)) / 100)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function computeVariance(
  planned: number[],
  actual: number[],
  currentWeekIndex: number,
): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (planned.length === 0 || actual.length === 0) {
    return { label: 'No baseline yet', tone: 'warning' }
  }
  const currentActual = actual[actual.length - 1] ?? 0
  // First week-index in planned curve where cumulative-% >= currentActual.
  const idx = planned.findIndex((p) => p >= currentActual)
  if (idx === -1) {
    // Actual exceeds even the final planned week.
    return { label: 'Ahead of schedule', tone: 'success' }
  }
  const varianceWeeks = idx - currentWeekIndex
  const days = varianceWeeks * 7
  if (days === 0) return { label: 'On schedule', tone: 'success' }
  if (days > 0) return { label: `${days} days ahead`, tone: 'success' }
  return { label: `${Math.abs(days)} days behind`, tone: 'danger' }
}

export function SCurveChart({ planned, actual, currentWeekIndex }: SCurveChartProps) {
  const weekCount = Math.max(planned.length, actual.length, 2)

  if (planned.length === 0 && actual.length === 0) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          color: 'var(--color-neutral-500)',
          fontSize: 13,
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
          background: 'var(--color-neutral-50)',
        }}
      >
        No progress data — import a master schedule and submit a weekly update.
      </div>
    )
  }

  const effectiveCurrentWeek =
    currentWeekIndex ?? Math.max(0, actual.length - 1)

  const variance = computeVariance(planned, actual, effectiveCurrentWeek)

  const plannedPath = buildPath(planned, weekCount)
  const actualPath = buildPath(actual, weekCount)

  // Y-axis ticks at 0/25/50/75/100.
  const yTicks = [0, 25, 50, 75, 100]
  // X-axis ticks: keep label count manageable.
  const xTickStep = Math.max(1, Math.ceil(weekCount / 12))
  const xTicks: number[] = []
  for (let i = 0; i < weekCount; i += xTickStep) xTicks.push(i)
  if (xTicks[xTicks.length - 1] !== weekCount - 1) xTicks.push(weekCount - 1)

  const chipTone =
    variance.tone === 'success'
      ? { bg: 'var(--color-success-soft)', fg: 'var(--color-success)' }
      : variance.tone === 'danger'
        ? { bg: 'var(--color-danger-soft)', fg: 'var(--color-danger)' }
        : { bg: 'var(--color-warning-soft)', fg: 'var(--color-warning)' }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
          <LegendSwatch color="var(--color-navy-700)" label="Planned" />
          <LegendSwatch color="var(--color-gold-600)" label="Actual" />
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 600,
            background: chipTone.bg,
            color: chipTone.fg,
            borderRadius: 999,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'currentColor',
            }}
          />
          {variance.label}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', maxWidth: '100%' }}
        role="img"
        aria-label="S-curve of planned vs actual progress"
      >
        {/* Plot background */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={PLOT_W}
          height={PLOT_H}
          fill="var(--color-neutral-50)"
        />

        {/* Y gridlines + labels */}
        {yTicks.map((t) => {
          const y = PAD_T + PLOT_H * (1 - t / 100)
          return (
            <g key={`y-${t}`}>
              <line
                x1={PAD_L}
                x2={PAD_L + PLOT_W}
                y1={y}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={t === 0 || t === 100 ? 1 : 0.5}
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-neutral-500)"
              >
                {t}%
              </text>
            </g>
          )
        })}

        {/* X ticks + labels */}
        {xTicks.map((wi) => {
          const step = PLOT_W / Math.max(1, weekCount - 1)
          const x = PAD_L + wi * step
          return (
            <g key={`x-${wi}`}>
              <line
                x1={x}
                x2={x}
                y1={PAD_T + PLOT_H}
                y2={PAD_T + PLOT_H + 4}
                stroke="var(--color-border)"
              />
              <text
                x={x}
                y={PAD_T + PLOT_H + 18}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-neutral-500)"
              >
                W{wi + 1}
              </text>
            </g>
          )
        })}

        {/* Current week indicator */}
        {actual.length > 0 && (
          <line
            x1={PAD_L + effectiveCurrentWeek * (PLOT_W / Math.max(1, weekCount - 1))}
            x2={PAD_L + effectiveCurrentWeek * (PLOT_W / Math.max(1, weekCount - 1))}
            y1={PAD_T}
            y2={PAD_T + PLOT_H}
            stroke="var(--color-neutral-400)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        )}

        {/* Planned line */}
        {plannedPath && (
          <path
            d={plannedPath}
            fill="none"
            stroke="var(--color-navy-700)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Actual line */}
        {actualPath && (
          <path
            d={actualPath}
            fill="none"
            stroke="var(--color-gold-600)"
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Y-axis label */}
        <text
          x={12}
          y={PAD_T + PLOT_H / 2}
          fontSize={11}
          fill="var(--color-neutral-500)"
          transform={`rotate(-90 12 ${PAD_T + PLOT_H / 2})`}
          textAnchor="middle"
        >
          Cumulative %
        </text>

        {/* X-axis label */}
        <text
          x={PAD_L + PLOT_W / 2}
          y={H - 4}
          fontSize={11}
          fill="var(--color-neutral-500)"
          textAnchor="middle"
        >
          Week
        </text>
      </svg>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span
        style={{
          display: 'inline-block',
          width: 18,
          height: 3,
          background: color,
          borderRadius: 2,
        }}
      />
      <span style={{ color: 'var(--color-neutral-600)' }}>{label}</span>
    </span>
  )
}
