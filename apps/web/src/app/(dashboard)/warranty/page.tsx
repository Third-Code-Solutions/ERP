import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { warrantyTickets, projects, accounts } from '@third-code-erp/database/schema'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Warranty Tickets' }

const STATUS_BADGE: Record<string, string> = {
  open: 'stage-badge stage-opportunity_creation',
  acknowledged: 'stage-badge stage-scoping',
  scheduled: 'stage-badge stage-bom_submission',
  in_progress: 'stage-badge stage-negotiation',
  closed: 'stage-badge stage-closed_won',
  cancelled: 'stage-badge stage-closed_lost',
}

export default async function WarrantyTicketsPage() {
  const profile = await requireUserProfile()

  const rows = await db
    .select({
      id: warrantyTickets.id,
      ticket_number: warrantyTickets.ticket_number,
      category: warrantyTickets.category,
      description: warrantyTickets.description,
      status: warrantyTickets.status,
      created_at: warrantyTickets.created_at,
      acknowledged_at: warrantyTickets.acknowledged_at,
      project_id: warrantyTickets.project_id,
      project_name: projects.name,
      account_name: accounts.name,
      sla_breached_ack: warrantyTickets.sla_breached_ack,
      sla_breached_schedule: warrantyTickets.sla_breached_schedule,
    })
    .from(warrantyTickets)
    .innerJoin(projects, eq(projects.id, warrantyTickets.project_id))
    .leftJoin(accounts, eq(accounts.id, warrantyTickets.account_id))
    .where(eq(warrantyTickets.tenant_id, profile.tenantId))
    .orderBy(desc(warrantyTickets.created_at))
    .limit(200)

  const openCount = rows.filter((r) => !['closed', 'cancelled'].includes(r.status)).length
  const breachedCount = rows.filter((r) => r.sla_breached_ack || r.sla_breached_schedule).length

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Customer Experience</p>
        <h1 className="page-title">Warranty tickets</h1>
        <p className="page-subtitle">
          Client warranty support queue with 24-hr ack / 48-hr schedule SLA enforcement.
        </p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Kpi label="Open" value={openCount.toString()} />
        <Kpi label="SLA breached" value={breachedCount.toString()} tone={breachedCount > 0 ? 'danger' : 'normal'} />
        <Kpi label="Closed" value={rows.filter((r) => r.status === 'closed').length.toString()} />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{rows.length} ticket{rows.length === 1 ? '' : 's'}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="card-empty">No warranty tickets yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Project</th>
                <th>Category</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const hoursSinceCreate = Math.floor(
                  (Date.now() - new Date(r.created_at).getTime()) / 3_600_000
                )
                return (
                  <tr key={r.id}>
                    <td><strong>{r.ticket_number}</strong></td>
                    <td>
                      <Link href={`/projects/${r.project_id}`} style={{ color: 'inherit' }}>
                        {r.project_name}
                      </Link>
                      {r.account_name && (
                        <div className="muted" style={{ fontSize: 11 }}>{r.account_name}</div>
                      )}
                    </td>
                    <td className="muted">{r.category}</td>
                    <td>
                      <span className={STATUS_BADGE[r.status] ?? 'stage-badge'}>
                        <span className="stage-badge-dot" />
                        {r.status}
                      </span>
                      {(r.sla_breached_ack || r.sla_breached_schedule) && (
                        <span style={{ marginLeft: 6, color: 'var(--color-danger)', fontSize: 11 }}>
                          SLA breached
                        </span>
                      )}
                    </td>
                    <td className="muted">
                      {hoursSinceCreate < 24
                        ? `${hoursSinceCreate}h ago`
                        : new Date(r.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </td>
                    <td>
                      <span style={{ color: 'var(--color-navy-700)', fontSize: 12.5, fontWeight: 500 }}>
                        Open →
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'normal' }) {
  return (
    <div className="kpi-card">
      <p className="kpi-card-label">{label}</p>
      <p
        className="kpi-card-value"
        style={tone === 'danger' ? { color: 'var(--color-danger)' } : {}}
      >
        {value}
      </p>
    </div>
  )
}
