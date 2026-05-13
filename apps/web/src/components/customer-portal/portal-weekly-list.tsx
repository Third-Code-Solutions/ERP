'use client'

/**
 * Customer-portal weekly snapshots list.
 *
 * Each row shows week_ending, overall %, civil/elec/mep/finishes %, and the
 * notes from progress_updates. Clicking a row expands it to show the full
 * snapshot from the corresponding weekly_reports row (if present, joined
 * server-side by week_ending). Pure client interactivity — no mutations.
 */

import { useState } from 'react'

interface PercentByCategory {
  civil_pct?: number
  electrical_pct?: number
  mep_pct?: number
  finishes_pct?: number
  overall_pct?: number
}

interface WeeklySnapshotEntry {
  /** progress_updates.id */
  id: string
  /** ISO timestamp */
  week_ending: string
  percent_by_category: PercentByCategory
  notes: string | null
  /** Optional matched weekly_reports.snapshot JSON. */
  report_snapshot: Record<string, unknown> | null
}

interface PortalWeeklyListProps {
  entries: WeeklySnapshotEntry[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtPct(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

function PctBlock({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: '#6b7280',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: 13,
          color: '#0F2D4A',
          fontWeight: 500,
        }}
      >
        {fmtPct(value)}
      </span>
    </div>
  )
}

function renderSnapshotValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function PortalWeeklyList({ entries }: PortalWeeklyListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (entries.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: 'center',
          color: '#6b7280',
          fontSize: 13.5,
        }}
      >
        No weekly snapshots yet — your team will update this weekly.
      </div>
    )
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {entries.map((entry) => {
        const isOpen = expandedId === entry.id
        const pc = entry.percent_by_category
        const hasReport = entry.report_snapshot !== null

        return (
          <li
            key={entry.id}
            style={{ borderBottom: '1px solid #f1f3f6' }}
          >
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : entry.id)}
              aria-expanded={isOpen}
              style={{
                width: '100%',
                background: isOpen ? '#fafbfc' : 'white',
                border: 0,
                padding: '14px 20px',
                textAlign: 'left',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
                display: 'flex',
                gap: 18,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '0 0 130px' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#6b7280',
                    fontWeight: 600,
                  }}
                >
                  Week ending
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 14,
                    color: '#0F2D4A',
                    fontWeight: 500,
                  }}
                >
                  {fmtDate(entry.week_ending)}
                </p>
              </div>

              <div
                style={{
                  flex: '0 0 110px',
                  fontFamily: 'var(--font-jetbrains), monospace',
                  fontSize: 22,
                  color: '#0F2D4A',
                  fontWeight: 600,
                }}
              >
                {fmtPct(pc.overall_pct)}
              </div>

              <div
                style={{
                  flex: '1 1 260px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 12,
                  minWidth: 240,
                }}
              >
                <PctBlock label="Civil" value={pc.civil_pct} />
                <PctBlock label="Elec" value={pc.electrical_pct} />
                <PctBlock label="MEP" value={pc.mep_pct} />
                <PctBlock label="Finishes" value={pc.finishes_pct} />
              </div>

              <span
                aria-hidden
                style={{
                  flex: '0 0 auto',
                  marginLeft: 'auto',
                  color: '#6b7280',
                  fontSize: 12,
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 150ms ease',
                }}
              >
                ▾
              </span>
            </button>

            {entry.notes && (
              <div
                style={{
                  padding: '0 20px 14px',
                  fontSize: 13,
                  color: '#4b5563',
                  lineHeight: 1.55,
                  marginTop: -4,
                }}
              >
                {entry.notes}
              </div>
            )}

            {isOpen && (
              <div
                style={{
                  background: '#fafbfc',
                  borderTop: '1px solid #eef0f4',
                  padding: '14px 20px 20px',
                }}
              >
                {hasReport ? (
                  <dl
                    style={{
                      margin: 0,
                      display: 'grid',
                      gridTemplateColumns: 'max-content 1fr',
                      gap: '6px 18px',
                      fontSize: 13,
                    }}
                  >
                    {Object.entries(entry.report_snapshot ?? {}).map(([k, v]) => (
                      <div
                        key={k}
                        style={{ display: 'contents' }}
                      >
                        <dt
                          style={{
                            color: '#6b7280',
                            fontSize: 11,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            paddingTop: 2,
                          }}
                        >
                          {k.replace(/_/g, ' ')}
                        </dt>
                        <dd
                          style={{
                            margin: 0,
                            color: '#0F2D4A',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {renderSnapshotValue(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: '#6b7280',
                      fontStyle: 'italic',
                    }}
                  >
                    No formal weekly report has been published for this week yet.
                  </p>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
