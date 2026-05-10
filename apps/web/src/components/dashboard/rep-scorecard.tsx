import type { RepScorecard } from '@/lib/dashboard-queries'
import { formatCentsCompact } from '@buildops/shared-types'

interface RepScorecardTableProps {
  reps: RepScorecard[]
}

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return (
    local
      .split(/[._-]/)
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '??'
  )
}

function avatarColor(seed: string): string {
  // Deterministic hue from email
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const palette = [
    '#1f3864',
    '#2a4a84',
    '#3a5fa0',
    '#4338ca',
    '#0f766e',
    '#b45309',
    '#9333ea',
    '#0e7490',
  ]
  return palette[hash % palette.length] ?? palette[0]!
}

export function RepScorecardTable({ reps }: RepScorecardTableProps) {
  const sortedReps = [...reps].sort((a, b) => b.activeTcv - a.activeTcv)

  const totals = sortedReps.reduce(
    (acc, r) => ({
      activeTcv: acc.activeTcv + r.activeTcv,
      activeGp: acc.activeGp + r.activeGp,
      wonTcv: acc.wonTcv + r.wonTcv,
      activeCount: acc.activeCount + r.activeCount,
      wonCount: acc.wonCount + r.wonCount,
      lostCount: acc.lostCount + r.lostCount,
      weightedTcv: acc.weightedTcv + r.weightedTcv,
    }),
    {
      activeTcv: 0,
      activeGp: 0,
      wonTcv: 0,
      activeCount: 0,
      wonCount: 0,
      lostCount: 0,
      weightedTcv: 0,
    }
  )

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Sales Rep Scorecard</h2>
          <p className="card-subtitle">
            {sortedReps.length}{' '}
            {sortedReps.length === 1 ? 'rep with active deals' : 'reps with active deals'}
          </p>
        </div>
        <div className="card-toolbar">
          <span>Sorted by Active TCV</span>
        </div>
      </div>

      {sortedReps.length === 0 ? (
        <div className="card-empty">
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
                <th className="numeric">Weighted</th>
                <th className="numeric">Won TCV</th>
                <th className="numeric">Won</th>
                <th className="numeric">Lost</th>
                <th className="numeric">Active</th>
              </tr>
            </thead>
            <tbody>
              {sortedReps.map((rep) => {
                const gpPct = rep.gpMarginBps / 100
                const conversionRate =
                  rep.wonCount + rep.lostCount > 0
                    ? (rep.wonCount / (rep.wonCount + rep.lostCount)) * 100
                    : null
                const lowMargin = gpPct > 0 && gpPct < 15
                return (
                  <tr key={rep.repId}>
                    <td>
                      <div className="row-leader">
                        <div
                          className="avatar-pill"
                          style={{ background: avatarColor(rep.repEmail) }}
                          aria-hidden
                        >
                          {initialsFromEmail(rep.repEmail)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 500, color: 'var(--color-neutral-900)' }}>
                            {rep.repEmail.split('@')[0]}
                          </span>
                          {conversionRate !== null ? (
                            <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
                              {conversionRate.toFixed(0)}% conv ·{' '}
                              {rep.wonCount + rep.lostCount} closed
                            </span>
                          ) : (
                            <span style={{ fontSize: 11.5, color: 'var(--color-neutral-500)' }}>
                              No closed deals yet
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="currency">{formatCentsCompact(rep.activeTcv)}</td>
                    <td className="currency">{formatCentsCompact(rep.activeGp)}</td>
                    <td
                      className="numeric"
                      style={{
                        color: lowMargin ? 'var(--color-danger)' : 'inherit',
                        fontWeight: lowMargin ? 600 : 400,
                      }}
                    >
                      {gpPct.toFixed(1)}%
                    </td>
                    <td className="currency">{formatCentsCompact(rep.weightedTcv)}</td>
                    <td className="currency muted">{formatCentsCompact(rep.wonTcv)}</td>
                    <td className="numeric">{rep.wonCount}</td>
                    <td className="numeric muted">{rep.lostCount}</td>
                    <td className="numeric">{rep.activeCount}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-neutral-50)' }}>
                <td style={{ fontWeight: 600, color: 'var(--color-neutral-700)' }}>
                  Team total
                </td>
                <td className="currency" style={{ fontWeight: 600 }}>
                  {formatCentsCompact(totals.activeTcv)}
                </td>
                <td className="currency" style={{ fontWeight: 600 }}>
                  {formatCentsCompact(totals.activeGp)}
                </td>
                <td className="numeric" style={{ fontWeight: 600 }}>
                  {totals.activeTcv > 0
                    ? ((totals.activeGp / totals.activeTcv) * 100).toFixed(1)
                    : '0.0'}
                  %
                </td>
                <td className="currency" style={{ fontWeight: 600 }}>
                  {formatCentsCompact(totals.weightedTcv)}
                </td>
                <td className="currency muted" style={{ fontWeight: 600 }}>
                  {formatCentsCompact(totals.wonTcv)}
                </td>
                <td className="numeric" style={{ fontWeight: 600 }}>
                  {totals.wonCount}
                </td>
                <td className="numeric muted" style={{ fontWeight: 600 }}>
                  {totals.lostCount}
                </td>
                <td className="numeric" style={{ fontWeight: 600 }}>
                  {totals.activeCount}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
