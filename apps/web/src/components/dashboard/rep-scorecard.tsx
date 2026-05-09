import type { RepScorecard } from '@/lib/dashboard-queries'
import { formatCentsCompact } from '@buildops/shared-types'

interface RepScorecardTableProps {
  reps: RepScorecard[]
}

export function RepScorecardTable({ reps }: RepScorecardTableProps) {
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
          Sales Rep Scorecard
        </h2>
      </div>

      {reps.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.875rem' }}>
          No pipeline data yet. Create opportunities to see rep performance here.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Rep</th>
                <th className="numeric">Active TCV</th>
                <th className="numeric">Active GP</th>
                <th className="numeric">GP %</th>
                <th className="numeric">Won TCV</th>
                <th className="numeric">Won</th>
                <th className="numeric">Lost</th>
                <th className="numeric">Active</th>
                <th className="numeric">Weighted</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((rep) => (
                <tr key={rep.repId}>
                  <td style={{ fontWeight: 500 }}>{rep.repEmail}</td>
                  <td className="currency">{formatCentsCompact(rep.activeTcv)}</td>
                  <td className="currency">{formatCentsCompact(rep.activeGp)}</td>
                  <td className="numeric" style={{ color: rep.gpMarginBps >= 2000 ? 'var(--color-success)' : 'inherit' }}>
                    {(rep.gpMarginBps / 100).toFixed(1)}%
                  </td>
                  <td className="currency">{formatCentsCompact(rep.wonTcv)}</td>
                  <td className="numeric" style={{ color: 'var(--color-success)' }}>{rep.wonCount}</td>
                  <td className="numeric" style={{ color: 'var(--color-danger)' }}>{rep.lostCount}</td>
                  <td className="numeric">{rep.activeCount}</td>
                  <td className="currency">{formatCentsCompact(rep.weightedTcv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
