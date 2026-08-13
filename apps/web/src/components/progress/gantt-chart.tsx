/**
 * GanttChart — pure SVG Gantt timeline for L1 master schedules.
 *
 * Renders one row per task with a planned span bar and an optional progress
 * overlay (`actual_pct`). Headers show week columns ("W1 Jun 02") with bolder
 * dividers at month boundaries. A "today" marker is drawn when within range.
 * Predecessor links are drawn as right-angle paths from a predecessor's
 * finish to a successor's start.
 *
 * No charting library. ABI OPS tokens only (navy / copper / neutral).
 */
'use client'

interface GanttTask {
  name: string
  start_date: string
  finish_date: string
  predecessor_index?: number | null
  actual_pct?: number
}

export interface GanttChartProps {
  tasks: GanttTask[]
  weeksToShow?: number
  today?: Date
}

const ROW_HEIGHT = 28
const HEADER_HEIGHT = 60
const LABEL_WIDTH = 240
const WEEK_PX = 80
const MS_PER_DAY = 86_400_000
const MS_PER_WEEK = MS_PER_DAY * 7
const BAR_INSET_Y = 6 // top/bottom padding inside a row for the bar
const BAR_RADIUS = 3

function parseISO(value: string): Date {
  // Accept "YYYY-MM-DD" or full ISO. Treat date-only strings as UTC midnight
  // to avoid TZ shifting bars by a day depending on the viewer's locale.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  return dateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value)
}

function startOfWeekUTC(d: Date): Date {
  const x = new Date(d)
  // Anchor to Monday in UTC.
  const day = x.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day
  x.setUTCDate(x.getUTCDate() + diff)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function formatMonthDay(d: Date): string {
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  })
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

interface ComputedTask {
  task: GanttTask
  rowIndex: number
  startMs: number
  finishMs: number
  barX: number
  barY: number
  barWidth: number
  barHeight: number
}

export function GanttChart({ tasks, weeksToShow, today }: GanttChartProps) {
  if (tasks.length === 0) {
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
        No master schedule imported yet — use the Master Schedule import to
        upload your L1 plan.
      </div>
    )
  }

  const parsed = tasks.map((t) => ({
    task: t,
    startMs: parseISO(t.start_date).getTime(),
    finishMs: parseISO(t.finish_date).getTime(),
  }))

  const minStart = parsed.reduce((m, p) => Math.min(m, p.startMs), Infinity)
  const maxFinish = parsed.reduce((m, p) => Math.max(m, p.finishMs), -Infinity)

  // Snap chart start to the Monday of the earliest task's week.
  const chartStart = startOfWeekUTC(new Date(minStart))
  const chartStartMs = chartStart.getTime()

  const spanWeeks = Math.max(
    1,
    Math.ceil((maxFinish - chartStartMs) / MS_PER_WEEK),
  )
  const totalWeeks = Math.max(2, weeksToShow ?? spanWeeks + 2)
  const totalMs = totalWeeks * MS_PER_WEEK

  const plotWidth = totalWeeks * WEEK_PX
  const svgWidth = Math.max(800, LABEL_WIDTH + plotWidth)
  const svgHeight = HEADER_HEIGHT + tasks.length * ROW_HEIGHT + 8

  const plotX = LABEL_WIDTH

  const computeX = (ms: number): number => {
    const clamped = Math.max(chartStartMs, Math.min(chartStartMs + totalMs, ms))
    return plotX + ((clamped - chartStartMs) / totalMs) * plotWidth
  }

  const computed: ComputedTask[] = parsed.map((p, i) => {
    const xStart = computeX(p.startMs)
    const xEnd = computeX(p.finishMs)
    const barX = xStart
    const barWidth = Math.max(2, xEnd - xStart)
    const barY = HEADER_HEIGHT + i * ROW_HEIGHT + BAR_INSET_Y
    return {
      task: p.task,
      rowIndex: i,
      startMs: p.startMs,
      finishMs: p.finishMs,
      barX,
      barY,
      barWidth,
      barHeight: ROW_HEIGHT - BAR_INSET_Y * 2,
    }
  })

  // Build week + month tick data.
  const weekTicks = Array.from({ length: totalWeeks }, (_, i) => {
    const ms = chartStartMs + i * MS_PER_WEEK
    const date = new Date(ms)
    const x = plotX + i * WEEK_PX
    const isMonthStart =
      date.getUTCDate() <= 7 // first occurrence of a month in this column
    return { i, ms, date, x, isMonthStart }
  })

  // Today marker — only render when inside range.
  const todayDate = today ?? new Date()
  const todayMs = todayDate.getTime()
  const todayInRange =
    todayMs >= chartStartMs && todayMs <= chartStartMs + totalMs
  const todayX = todayInRange ? computeX(todayMs) : null

  // Predecessor arrows — right-angle path from predecessor finish midpoint to
  // successor start midpoint.
  const arrows = computed.flatMap((c) => {
    const predIdx = c.task.predecessor_index
    if (predIdx === undefined || predIdx === null) return []
    if (predIdx < 0 || predIdx >= computed.length || predIdx === c.rowIndex) {
      return []
    }
    const pred = computed[predIdx]
    if (!pred) return []
    const fromX = pred.barX + pred.barWidth
    const fromY = pred.barY + pred.barHeight / 2
    const toX = c.barX
    const toY = c.barY + c.barHeight / 2
    const midX = Math.max(fromX + 6, toX - 6)
    const d = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`
    return [{ key: `${predIdx}->${c.rowIndex}`, d, toX, toY }]
  })

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width={svgWidth}
        height={svgHeight}
        style={{ display: 'block', minWidth: '100%', fontFamily: 'inherit' }}
        role="img"
        aria-label="Gantt chart of master schedule tasks"
      >
        <defs>
          <marker
            id="gantt-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-neutral-500)" />
          </marker>
        </defs>

        {/* Header background */}
        <rect
          x={0}
          y={0}
          width={svgWidth}
          height={HEADER_HEIGHT}
          fill="var(--color-neutral-50)"
        />
        <line
          x1={0}
          x2={svgWidth}
          y1={HEADER_HEIGHT}
          y2={HEADER_HEIGHT}
          stroke="var(--color-neutral-300)"
          strokeWidth={1}
        />

        {/* Label column divider */}
        <line
          x1={LABEL_WIDTH}
          x2={LABEL_WIDTH}
          y1={0}
          y2={svgHeight}
          stroke="var(--color-neutral-300)"
          strokeWidth={1}
        />

        {/* Week columns + labels */}
        {weekTicks.map((wt) => (
          <g key={`wk-${wt.i}`}>
            <line
              x1={wt.x}
              x2={wt.x}
              y1={0}
              y2={svgHeight}
              stroke="var(--color-neutral-300)"
              strokeWidth={wt.isMonthStart ? 1.25 : 0.5}
              opacity={wt.isMonthStart ? 1 : 0.6}
            />
            <text
              x={wt.x + 6}
              y={20}
              fontSize={11}
              fontWeight={600}
              fill="var(--color-neutral-700)"
            >
              W{wt.i + 1}
            </text>
            <text
              x={wt.x + 6}
              y={36}
              fontSize={10}
              fill="var(--color-neutral-500)"
              fontFamily="var(--font-mono)"
            >
              {formatMonthDay(wt.date)}
            </text>
          </g>
        ))}

        {/* Row separators */}
        {computed.map((c) => (
          <line
            key={`row-${c.rowIndex}`}
            x1={0}
            x2={svgWidth}
            y1={HEADER_HEIGHT + (c.rowIndex + 1) * ROW_HEIGHT}
            y2={HEADER_HEIGHT + (c.rowIndex + 1) * ROW_HEIGHT}
            stroke="var(--color-neutral-200, #e5e5e5)"
            strokeWidth={0.5}
          />
        ))}

        {/* Task labels (in label column) */}
        {computed.map((c) => (
          <text
            key={`lbl-${c.rowIndex}`}
            x={12}
            y={HEADER_HEIGHT + c.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 + 4}
            fontSize={12}
            fill="var(--color-neutral-900)"
          >
            <title>{c.task.name}</title>
            {truncate(c.task.name, 32)}
          </text>
        ))}

        {/* Task bars + progress overlay */}
        {computed.map((c) => {
          const hasActual = typeof c.task.actual_pct === 'number'
          const pct = Math.max(0, Math.min(100, c.task.actual_pct ?? 0))
          const progressWidth = (c.barWidth * pct) / 100
          return (
            <g key={`bar-${c.rowIndex}`}>
              <rect
                x={c.barX}
                y={c.barY}
                width={c.barWidth}
                height={c.barHeight}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
                fill={
                  hasActual
                    ? 'var(--color-navy-400)'
                    : 'var(--color-neutral-300)'
                }
              />
              {hasActual && progressWidth > 0 && (
                <rect
                  x={c.barX}
                  y={c.barY}
                  width={progressWidth}
                  height={c.barHeight}
                  rx={BAR_RADIUS}
                  ry={BAR_RADIUS}
                  fill="var(--color-navy-700)"
                />
              )}
            </g>
          )
        })}

        {/* Predecessor arrows */}
        {arrows.map((a) => (
          <path
            key={a.key}
            d={a.d}
            fill="none"
            stroke="var(--color-neutral-500)"
            strokeWidth={1}
            markerEnd="url(#gantt-arrow)"
          />
        ))}

        {/* Today marker */}
        {todayX !== null && (
          <g>
            <line
              x1={todayX}
              x2={todayX}
              y1={HEADER_HEIGHT - 6}
              y2={svgHeight}
              stroke="var(--color-gold-500)"
              strokeWidth={1.5}
            />
            <rect
              x={todayX - 18}
              y={HEADER_HEIGHT - 18}
              width={36}
              height={14}
              rx={3}
              ry={3}
              fill="var(--color-gold-500)"
            />
            <text
              x={todayX}
              y={HEADER_HEIGHT - 8}
              fontSize={10}
              fontWeight={700}
              fill="white"
              textAnchor="middle"
            >
              TODAY
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
