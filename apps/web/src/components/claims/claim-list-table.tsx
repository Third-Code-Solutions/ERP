import Link from 'next/link'
import { ClaimStatusBadge } from './claim-status-badge'

interface ClaimRow {
  id: string
  claim_number: string
  project_id: string
  project_name: string
  milestone_pct: number
  amount_cents: number
  status: string
  created_at: Date | string
}

interface ClaimListTableProps {
  rows: ClaimRow[]
}

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// Tight relative-time helper. We deliberately avoid pulling date-fns into
// this leaf so the list table stays lightweight.
function relativeTime(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const seconds = Math.round((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d ago`
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ClaimListTable({ rows }: ClaimListTableProps) {
  if (rows.length === 0) {
    return (
      <div className="card-empty">
        No claims yet. Create one to track milestone billing.
      </div>
    )
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Claim #</th>
          <th>Project</th>
          <th style={{ textAlign: 'right' }}>Milestone %</th>
          <th style={{ textAlign: 'right' }}>Amount</th>
          <th>Status</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={`/claims/${r.id}`} style={{ color: 'inherit', fontWeight: 600 }}>
                {r.claim_number}
              </Link>
            </td>
            <td>
              <Link href={`/projects/${r.project_id}`} style={{ color: 'inherit' }}>
                {r.project_name}
              </Link>
            </td>
            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {r.milestone_pct}%
            </td>
            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formatPHP(r.amount_cents)}
            </td>
            <td>
              <ClaimStatusBadge status={r.status} />
            </td>
            <td className="muted">{relativeTime(r.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
