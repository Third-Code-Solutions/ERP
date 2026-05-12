import Link from 'next/link'
import { and, desc, eq, sql } from 'drizzle-orm'
import { requireUserProfile } from '@buildops/auth'
import { db } from '@buildops/database'
import { punchlistItems, projects } from '@buildops/database/schema'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Punchlist' }

const STATUS_BADGE: Record<string, string> = {
  open: 'stage-badge stage-opportunity_creation',
  in_progress: 'stage-badge stage-scoping',
  for_inspection: 'stage-badge stage-negotiation',
  closed: 'stage-badge stage-closed_won',
}

const PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--color-neutral-500)',
  medium: 'var(--color-info)',
  high: 'var(--color-warning)',
  critical: 'var(--color-danger)',
}

export default async function PunchlistPage() {
  const profile = await requireUserProfile()

  const rows = await db
    .select({
      id: punchlistItems.id,
      project_id: punchlistItems.project_id,
      project_name: projects.name,
      description: punchlistItems.description,
      location: punchlistItems.location,
      trade: punchlistItems.trade,
      priority: punchlistItems.priority,
      status: punchlistItems.status,
      due_date: punchlistItems.due_date,
      assigned_to_text: punchlistItems.assigned_to_text,
    })
    .from(punchlistItems)
    .innerJoin(projects, eq(projects.id, punchlistItems.project_id))
    .where(eq(punchlistItems.tenant_id, profile.tenantId))
    .orderBy(desc(punchlistItems.created_at))
    .limit(200)

  const openCount = rows.filter((r) => r.status === 'open').length
  const closedCount = rows.filter((r) => r.status === 'closed').length
  const pct = rows.length ? Math.round((closedCount / rows.length) * 100) : 0

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Post-Construction</p>
        <h1 className="page-title">Punchlist</h1>
        <p className="page-subtitle">
          Defects tracked to closure with photos and PE sign-off. {pct}% closed across {rows.length} items.
        </p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Kpi label="Open" value={openCount.toString()} />
        <Kpi label="In progress" value={rows.filter((r) => r.status === 'in_progress').length.toString()} />
        <Kpi label="Closed" value={closedCount.toString()} />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{rows.length} item{rows.length === 1 ? '' : 's'}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="card-empty">No punchlist items yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Project</th>
                <th>Trade</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.description.slice(0, 80)}
                    {r.location && <span className="muted"> — {r.location}</span>}
                  </td>
                  <td>
                    <Link href={`/projects/${r.project_id}`} style={{ color: 'inherit' }}>
                      {r.project_name}
                    </Link>
                  </td>
                  <td className="muted">{r.trade ?? '—'}</td>
                  <td style={{ color: PRIORITY_COLOR[r.priority], fontWeight: 500 }}>{r.priority}</td>
                  <td>
                    <span className={STATUS_BADGE[r.status] ?? 'stage-badge'}>
                      <span className="stage-badge-dot" />
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="muted">
                    {r.due_date
                      ? new Date(r.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi-card">
      <p className="kpi-card-label">{label}</p>
      <p className="kpi-card-value">{value}</p>
    </div>
  )
}
