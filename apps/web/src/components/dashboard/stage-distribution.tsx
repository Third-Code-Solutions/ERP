import React from 'react'
import type { StageRow } from '@/lib/dashboard-queries'
import {
  formatCentsCompact,
  PIPELINE_STAGES,
  type PipelineStage,
} from '@third-code-erp/shared-types'

const STAGE_LABELS: Record<PipelineStage, string> = {
  lead: 'Lead',
  site_survey: 'Site Survey',
  design: 'Design',
  bom_submission: 'BOM Submission',
  negotiation: 'Negotiation',
  contract: 'Contract',
  won: 'Won',
  lost: 'Lost',
}

const STAGE_HUES: Record<PipelineStage, string> = {
  lead: '#6b7280',
  site_survey: '#4f46e5',
  design: '#8b5cf6',
  bom_submission: '#0891b2',
  negotiation: '#ea580c',
  contract: '#0ea5e9',
  won: '#16a34a',
  lost: '#dc2626',
}

const ACTIVE_STAGES: ReadonlySet<PipelineStage> = new Set(
  PIPELINE_STAGES.filter((stage) => stage !== 'won' && stage !== 'lost')
)

interface StageDistributionTableProps {
  rows: StageRow[]
}

export function StageDistributionTable({ rows }: StageDistributionTableProps) {
  const sortedRows = [...rows].sort(
    (a, b) =>
      PIPELINE_STAGES.indexOf(a.stage as PipelineStage) -
      PIPELINE_STAGES.indexOf(b.stage as PipelineStage)
  )

  const activeRows = sortedRows.filter((row) => ACTIVE_STAGES.has(row.stage as PipelineStage))
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
                        background: STAGE_HUES[r.stage as PipelineStage] ?? '#525252',
                      }}
                      title={`${STAGE_LABELS[r.stage as PipelineStage] ?? r.stage} — ${formatCentsCompact(r.tcvCents)}`}
                    >
                      {widthPct >= 14 ? (
                        <>
                          <span className="funnel-segment-label">
                            {STAGE_LABELS[r.stage as PipelineStage] ?? r.stage}
                          </span>
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
                      style={{ background: STAGE_HUES[r.stage as PipelineStage] ?? '#525252' }}
                      aria-hidden
                    />
                    {STAGE_LABELS[r.stage as PipelineStage] ?? r.stage}
                    <span style={{ color: 'var(--color-neutral-400)' }}>· {r.count}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ overflowX: 'auto' }}>
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
                  const stageLabel = STAGE_LABELS[row.stage as PipelineStage] ?? row.stage
                  return (
                    <tr key={row.stage}>
                      <th scope="row" style={{ fontWeight: 'normal', textAlign: 'left' }}>
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
