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

interface StageDistributionTableProps {
  rows: StageRow[]
}

export function StageDistributionTable({ rows }: StageDistributionTableProps) {
  const sortedRows = [...rows].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  )

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        marginBottom: '24px',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0, color: 'var(--color-neutral-900)' }}>
          Stage Distribution
        </h2>
      </div>

      {sortedRows.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.875rem' }}>
          No pipeline data yet.
        </div>
      ) : (
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
                const isWon = row.stage === 'closed_won'
                const isLost = row.stage === 'closed_lost'
                return (
                  <tr key={row.stage}>
                    <td>
                      <span
                        style={{
                          color: isWon
                            ? 'var(--color-success)'
                            : isLost
                              ? 'var(--color-danger)'
                              : 'inherit',
                          fontWeight: isWon || isLost ? 600 : 400,
                        }}
                      >
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
      )}
    </div>
  )
}
