import type { StageRow } from '@/lib/dashboard-queries'
import { formatCentsCompact } from '@third-code-erp/shared-types'

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead',
  site_survey: 'Site Survey',
  design: 'Design',
  bom_submission: 'BOM Submission',
  negotiation: 'Negotiation',
  contract: 'Contract',
  won: 'Won',
  lost: 'Lost',
}

const STAGE_ORDER = [
  'lead',
  'site_survey',
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
  'lost',
]

const STAGE_HUES: Record<string, string> = {
  lead: '#6b7280',
  site_survey: '#4f46e5',
  design: '#7c3aed',
  bom_submission: '#0891b2',
  negotiation: '#ea580c',
  contract: '#c2410c',
  won: '#16a34a',
  lost: '#dc2626',
}

const ACTIVE_STAGES = new Set([
  'lead',
  'site_survey',
  'design',
  'bom_submission',
  'negotiation',
  'contract',
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
    <section className="card" aria-labelledby="pipeline-stages-heading">
      <div className="card-header">
        <div>
          <h2 className="card-title" id="pipeline-stages-heading">
            Pipeline Stages
          </h2>
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
            <div className="funnel-shell">
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
                    <span className="funnel-legend-count">· {r.count}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="data-table-wrap">
            <table className="data-table">
              <caption className="sr-only">
                Pipeline distribution by stage, showing deal count, total contract
                value, gross profit, and gross-profit percentage for each stage.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col" className="numeric">
                    Deals
                  </th>
                  <th scope="col" className="numeric">
                    TCV
                  </th>
                  <th scope="col" className="numeric">
                    GP
                  </th>
                  <th scope="col" className="numeric">
                    GP %
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const gpPct = row.tcvCents > 0 ? (row.gpCents / row.tcvCents) * 100 : 0
                  const stageLabel = STAGE_LABELS[row.stage] ?? row.stage
                  return (
                    <tr key={row.stage}>
                      <th scope="row" className="stage-table-heading">
                        <span className={`stage-badge stage-${row.stage}`}>
                          <span className="stage-badge-dot" aria-hidden />
                          <span className="sr-only">Stage: </span>
                          {stageLabel}
                        </span>
                      </th>
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
    </section>
  )
}
