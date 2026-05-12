'use client'

/**
 * RFQ list table with status filter chips (REFACTOR.md M3 US-013).
 *
 * Client-side only because the filter chips swap searchParams without a
 * full page reload — the page server-component already re-runs on
 * navigation, but using `<Link>` here keeps URL-driven state.
 */

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface RfqRow {
  id: string
  status: string
  line_count: number
  quote_count: number
  bom_label: string
  project_name: string
  created_at: string
}

interface Props {
  rows: RfqRow[]
  activeStatus: string
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'stage-badge stage-opportunity_creation',
  quotes_received: 'stage-badge stage-bom_submission',
  completed: 'stage-badge stage-closed_won',
  cancelled: 'stage-badge stage-closed_lost',
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'quotes_received', label: 'Quotes in' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

export function RfqListTable({ rows, activeStatus }: Props) {
  const search = useSearchParams()

  const hrefFor = (status: string): string => {
    const params = new URLSearchParams(search.toString())
    if (status === 'all') params.delete('status')
    else params.set('status', status)
    const qs = params.toString()
    return qs ? `/procurement/rfqs?${qs}` : '/procurement/rfqs'
  }

  return (
    <div className="card">
      <div
        className="card-header"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <h2 className="card-title">
          {rows.length} RFQ{rows.length === 1 ? '' : 's'}
        </h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={hrefFor(f.key)}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid #d0d5dd',
                background: activeStatus === f.key ? '#0F2D4A' : 'white',
                color: activeStatus === f.key ? 'white' : '#1f2937',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card-empty">
          {activeStatus === 'all'
            ? 'No RFQs yet. They auto-dispatch when a BOM is internally approved.'
            : `No RFQs in status "${activeStatus.replace('_', ' ')}".`}
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>BOM</th>
              <th>Project</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Lines</th>
              <th style={{ textAlign: 'right' }}>Quotes</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const created = new Date(r.created_at)
              const hours = Math.floor((Date.now() - created.getTime()) / 3_600_000)
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/procurement/rfqs/${r.id}`} style={{ color: 'inherit' }}>
                      <strong>{r.bom_label}</strong>
                    </Link>
                  </td>
                  <td className="muted">{r.project_name}</td>
                  <td>
                    <span className={STATUS_BADGE[r.status] ?? 'stage-badge'}>
                      <span className="stage-badge-dot" />
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {r.line_count}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {r.quote_count}
                  </td>
                  <td className="muted">
                    {hours < 24
                      ? `${hours}h ago`
                      : created.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </td>
                  <td>
                    <Link
                      href={`/procurement/rfqs/${r.id}`}
                      style={{ color: 'var(--color-navy-700)', fontSize: 12.5, fontWeight: 500 }}
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
