'use client'

const QUOTA_BYTES = 500 * 1024 * 1024 // 500 MB per project (PRD F2.1)
const WARN_RATIO = 0.7
const DANGER_RATIO = 0.9

interface QuotaBarProps {
  /** Current bytes used by all documents on the project. */
  usedBytes: number
  /** Quota ceiling. Defaults to 500 MB. */
  quotaBytes?: number
}

function formatMB(bytes: number): string {
  // Show one decimal under 100 MB, whole numbers above for readability.
  const mb = bytes / (1024 * 1024)
  if (mb < 100) return `${mb.toFixed(1)} MB`
  return `${Math.round(mb)} MB`
}

function pickTone(ratio: number): { fill: string; track: string; text: string } {
  if (ratio >= DANGER_RATIO) {
    return {
      fill: 'var(--color-danger, #b91c1c)',
      track: 'rgba(185, 28, 28, 0.12)',
      text: 'var(--color-danger, #b91c1c)',
    }
  }
  if (ratio >= WARN_RATIO) {
    return {
      fill: 'var(--color-warning, #b45309)',
      track: 'rgba(180, 83, 9, 0.14)',
      text: 'var(--color-warning, #b45309)',
    }
  }
  return {
    fill: 'var(--color-success, #047857)',
    track: 'rgba(4, 120, 87, 0.12)',
    text: 'var(--color-neutral-700, #404040)',
  }
}

export function QuotaBar({ usedBytes, quotaBytes = QUOTA_BYTES }: QuotaBarProps) {
  const safeUsed = Math.max(0, usedBytes)
  const ratio = quotaBytes > 0 ? Math.min(1, safeUsed / quotaBytes) : 0
  const percentLabel = `${Math.round(ratio * 100)}%`
  const tone = pickTone(ratio)
  const isOver = safeUsed > quotaBytes

  return (
    <div
      role="group"
      aria-label="Project storage quota"
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'var(--color-neutral-700)',
            letterSpacing: '-0.005em',
          }}
        >
          Storage used
        </span>
        <span
          style={{
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-mono)',
            color: tone.text,
            fontWeight: isOver ? 600 : 500,
          }}
        >
          {formatMB(safeUsed)} of {formatMB(quotaBytes)} used ({percentLabel})
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${formatMB(safeUsed)} of ${formatMB(quotaBytes)} used`}
        style={{
          width: '100%',
          height: '6px',
          background: tone.track,
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: '100%',
            background: tone.fill,
            transition: 'width 200ms ease-out, background 200ms ease-out',
          }}
        />
      </div>
    </div>
  )
}
