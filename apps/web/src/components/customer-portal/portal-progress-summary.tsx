/**
 * Top progress summary card for the public Customer Portal.
 *
 * Read-only. Renders the latest weekly snapshot's overall completion %,
 * a friendly variance label vs the master schedule baseline, and the
 * week_ending date. Designed to be the very first thing a client sees
 * on the Progress sub-page.
 */

interface PortalProgressSummaryProps {
  /** 0-100. Latest overall completion %. Null when no progress recorded. */
  overallPct: number | null
  /** ISO timestamp of the latest update's week_ending. */
  weekEndingISO: string | null
  /**
   * Schedule variance label, e.g. "On schedule", "14 days behind",
   * "7 days ahead". Null when no baseline is available.
   */
  varianceLabel: string | null
  /** Tone signal so the variance pill renders semantically. */
  varianceTone: 'success' | 'warning' | 'danger' | null
  /** Short snapshot note (truncated externally if needed). */
  note: string | null
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function PortalProgressSummary({
  overallPct,
  weekEndingISO,
  varianceLabel,
  varianceTone,
  note,
}: PortalProgressSummaryProps) {
  const hasData = overallPct !== null && weekEndingISO !== null

  if (!hasData) {
    return (
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          padding: '32px 28px',
          textAlign: 'center',
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.05)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#6b7280',
            fontWeight: 600,
          }}
        >
          Project Progress
        </p>
        <h2
          style={{
            margin: '10px 0 6px',
            fontSize: 22,
            color: '#0F2D4A',
            fontWeight: 600,
          }}
        >
          No progress recorded yet
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: '#6b7280', lineHeight: 1.6 }}>
          Your team will update this weekly. Check back soon.
        </p>
      </section>
    )
  }

  const chipTone =
    varianceTone === 'success'
      ? { bg: '#e6f4ec', fg: '#1f7a4d' }
      : varianceTone === 'danger'
        ? { bg: '#fbeaea', fg: '#a13030' }
        : varianceTone === 'warning'
          ? { bg: '#fdf3e2', fg: '#a26414' }
          : { bg: '#eef0f4', fg: '#4b5563' }

  return (
    <section
      style={{
        background: 'white',
        border: '1px solid #d8dde6',
        borderRadius: 10,
        padding: '24px 28px',
        boxShadow: '0 1px 2px rgba(15, 45, 74, 0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 240px' }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#6b7280',
              fontWeight: 600,
            }}
          >
            Latest milestone · week ending {fmtDate(weekEndingISO!)}
          </p>
          <h2
            style={{
              margin: '8px 0 4px',
              fontSize: 30,
              color: '#0F2D4A',
              fontWeight: 600,
              fontFamily: 'var(--font-jetbrains), monospace',
              lineHeight: 1.1,
            }}
          >
            {Math.round(overallPct!)}% complete
          </h2>
          {note && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 13.5,
                color: '#4b5563',
                lineHeight: 1.55,
                maxWidth: 560,
              }}
            >
              {note}
            </p>
          )}
        </div>
        {varianceLabel && (
          <div style={{ alignSelf: 'flex-start' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                background: chipTone.bg,
                color: chipTone.fg,
                borderRadius: 999,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'currentColor',
                }}
              />
              {varianceLabel}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
