import type { ConversionRateRow } from '@/lib/dashboard-queries'

interface ConversionRateTableProps {
  rows: ConversionRateRow[]
}

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead',
  site_survey: 'Site Survey',
  design: 'Design',
  bom_submission: 'BOM Submission',
  negotiation: 'Negotiation',
  contract: 'Contract',
  won: 'Won',
}

interface BandStyle {
  background: string
  color: string
  label: string
}

function bandFor(pct: number): BandStyle {
  if (pct >= 60) {
    return { background: '#dcfce7', color: '#166534', label: 'Strong' }
  }
  if (pct >= 30) {
    return { background: '#fef3c7', color: '#92400e', label: 'Watch' }
  }
  return { background: '#fee2e2', color: '#991b1b', label: 'At risk' }
}

export function ConversionRateTable({ rows }: ConversionRateTableProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Stage Conversion</h2>
          <p className="card-subtitle">
            Rate at which opportunities advance between adjacent ABI stages
          </p>
        </div>
        <div className="card-toolbar">
          <span>Lifecycle</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card-empty">No opportunities yet — conversion rates unavailable.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th className="numeric">Cohort</th>
                <th className="numeric">Advanced</th>
                <th className="numeric">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const band = bandFor(r.ratePct)
                return (
                  <tr key={`${r.fromStage}->${r.toStage}`}>
                    <td>{STAGE_LABELS[r.fromStage] ?? r.fromStage}</td>
                    <td>{STAGE_LABELS[r.toStage] ?? r.toStage}</td>
                    <td className="numeric">{r.fromCount}</td>
                    <td className="numeric">{r.toCount}</td>
                    <td className="numeric">
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 10px',
                          borderRadius: 999,
                          background: band.background,
                          color: band.color,
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                        }}
                        title={band.label}
                      >
                        {r.ratePct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
