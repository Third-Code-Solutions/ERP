import type { StageRow } from '@/lib/dashboard-queries'
import { formatCentsCompact } from '@buildops/shared-types'

const STAGE_LABELS: Record<string, string> = {
  opportunity_creation: 'Opportunity Creation',
  scoping: 'Scoping',
  bom_submission: 'BOM Submission',
  resubmission: 'Resubmission',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
}

const STAGE_ORDER = [
  'opportunity_creation',
  'scoping',
  'bom_submission',
  'resubmission',
  'negotiation',
  'closed_won',
  'closed_lost',
]

const STAGE_HUES: Record<string, string> = {
  opportunity_creation: '#6b7280',
  scoping: '#4f46e5',
  bom_submission: '#0891b2',
  resubmission: '#ca8a04',
  negotiation: '#ea580c',
  closed_won: '#16a34a',
  closed_lost: '#dc2626',
}

const ACTIVE_STAGES = new Set([
  'opportunity_creation',
  'scoping',
  'bom_submission',
  'resubmission',
  'negotiation',
])

interface StageDistributionTableProps {
  rows: StageRow[]
}

export function StageDistributionTable({ rows }: StageDistributionTableProps) {
  const sortedRows = [...rows].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  )

  const activeRows = sortedRows.filter((r) => ACTIVE_STAGES.has(r.stage))
  const activeTotal = activeRows.reduce((acc, r) => acc + r.tcvCents, 0)

  const totalDeals = sortedRows.reduce((acc, r) => acc + r.count, 0)
  const totalTcv = sortedRows.reduce((acc, r) => acc + r.tcvCents, 0)
  const totalGp = sortedRows.reduce((acc, r) => acc + r.gpCents, 0)

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Pipeline Stages</h2>
          <p className="card-subtitle">
            {totalDeals} {totalDeals === 1 ? 'deal' : 'deals'} · {formatCentsCompact(totalTcv)} TCV ·{' '}
            {formatCentsCompact(totalGp)} GP
          </p>
        </div>
        <div className="card-toolbar">
          <span>By stage</span>
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <div className="card-empty">
          No pipeline data yet. Create opportunities to see distribution here.
        </div>
      ) : (
        <>
          {activeTotal > 0 ? (
            <div style={{ padding: '18px 18px 0' }}>
              <div className="funnel-bar" role="img" aria-label="Active pipeline distribution by stage">
                {activeRows.map((r) => {
                  const widthPct = (r.tcvCents / activeTotal) * 100
                  if (widthPct === 0) return null
                  return (
                    <div
                      key={r.stage}
                      className="funnel-segment"
                      style={{
                        width: `${widthPct}%`,
                        background: STAGE_HUES[r.stage] ?? '#525252',
                      }}
                      title={`${STAGE_LABELS[r.stage]} — ${formatCentsCompact(r.tcvCents)}`}
                    >
                      {widthPct >= 14 ? (
                        <>
                          <span className="funnel-segment-label">{STAGE_LABELS[r.stage]}</span>
                          <span className="funnel-segment-value">
                            {formatCentsCompact(r.tcvCents)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              <div className="funnel-legend">
                {activeRows.map((r) => (
                  <span key={r.stage} className="funnel-legend-item">
                    <span
                      className="funnel-legend-dot"
                      style={{ background: STAGE_HUES[r.stage] ?? '#525252' }}
                      aria-hidden
                    />
                    {STAGE_LABELS[r.stage]}
                    <span style={{ color: 'var(--color-neutral-400)' }}>· {r.count}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className="numeric">Deals</th>
                  <th className="numeric">TCV</th>
                  <th className="numeric">GP</th>
                  <th className="numeric">GP %</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const gpPct = row.tcvCents > 0 ? (row.gpCents / row.tcvCents) * 100 : 0
                  return (
                    <tr key={row.stage}>
                      <td>
                        <span className={`stage-badge stage-${row.stage}`}>
                          <span className="stage-badge-dot" aria-hidden />
                          {STAGE_LABELS[row.stage] ?? row.stage}
                        </span>
                      </td>
                      <td className="numeric">{row.count}</td>
                      <td className="currency">{formatCentsCompact(row.tcvCents)}</td>
                      <td className="currency">{formatCentsCompact(row.gpCents)}</td>
                      <td className="numeric">{gpPct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
