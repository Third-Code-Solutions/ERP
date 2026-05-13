import Link from 'next/link'

// Rendered from the deliveries list page. Pure presentational — every value
// arrives already serialized from the server component above. Days-waiting
// is the only computed property and it's deliberately recomputed at render
// time so the badge stays correct when the page is re-validated.

interface DeliveryRow {
  id: string
  status: string
  scheduled_date: string | null
  po_number: string | null
  vendor_name: string | null
}

interface Props {
  rows: DeliveryRow[]
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'stage-badge stage-opportunity_creation',
  site_preparing: 'stage-badge stage-scoping',
  site_ready: 'stage-badge stage-scoping',
  in_transit: 'stage-badge stage-bom_submission',
  received: 'stage-badge stage-negotiation',
  inspecting: 'stage-badge stage-negotiation',
  accepted: 'stage-badge stage-closed_won',
  rejected: 'stage-badge stage-closed_lost',
  cancelled: 'stage-badge stage-closed_lost',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function daysWaiting(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export function DeliveryListTable({ rows }: Props) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>PO Number</th>
          <th>Vendor</th>
          <th>Scheduled date</th>
          <th>Status</th>
          <th className="numeric">Days waiting</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const wait = daysWaiting(r.scheduled_date)
          // Show the "waiting" pill only if the delivery is still in the
          // scheduled state and the scheduled date is in the past — that's
          // the actionable signal procurement needs.
          const showWait = r.status === 'scheduled' && wait !== null && wait > 0
          return (
            <tr key={r.id}>
              <td>
                <Link
                  href={`/procurement/deliveries/${r.id}`}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--color-navy-700)',
                    textDecoration: 'none',
                  }}
                >
                  {r.po_number ?? '—'}
                </Link>
              </td>
              <td>{r.vendor_name ?? <span className="muted">—</span>}</td>
              <td className="muted">{fmtDate(r.scheduled_date)}</td>
              <td>
                <span className={STATUS_BADGE[r.status] ?? 'stage-badge'}>
                  <span className="stage-badge-dot" />
                  {r.status.replace(/_/g, ' ')}
                </span>
              </td>
              <td
                className="numeric"
                style={{
                  color: showWait ? 'var(--color-warning)' : 'var(--color-neutral-500)',
                  fontWeight: showWait ? 600 : 400,
                }}
              >
                {showWait ? `${wait}d overdue` : wait !== null && wait >= 0 ? `${wait}d` : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
