import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { permits, projects, users } from '@third-code-erp/database/schema'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Permits' }

const STATUS_BADGE: Record<string, string> = {
  not_started: 'stage-badge stage-opportunity_creation',
  submitted: 'stage-badge stage-scoping',
  additional_docs_required: 'stage-badge stage-resubmission',
  under_review: 'stage-badge stage-negotiation',
  approved: 'stage-badge stage-closed_won',
  rejected: 'stage-badge stage-closed_lost',
  released: 'stage-badge stage-closed_won',
  refunded: 'stage-badge stage-closed_won',
  cancelled: 'stage-badge stage-closed_lost',
}

const TYPE_LABEL: Record<string, string> = {
  building_admin_vetting: 'Bldg. admin vetting',
  lgu_building_permit: 'LGU bldg. permit',
  dole_permit: 'DOLE',
  occupancy_permit: 'Occupancy',
  cari: 'CARI',
  performance_bond: 'Performance bond',
  surety_bond: 'Surety bond',
  construction_bond: 'Construction bond',
}

export default async function PermitsPage() {
  const profile = await requireUserProfile()

  const rows = await db
    .select({
      id: permits.id,
      project_id: permits.project_id,
      project_name: projects.name,
      permit_type: permits.permit_type,
      status: permits.status,
      submitted_at: permits.submitted_at,
      expected_approval_at: permits.expected_approval_at,
      expected_return_at: permits.expected_return_at,
      responsible_name: users.full_name,
      last_status_change_at: permits.last_status_change_at,
    })
    .from(permits)
    .innerJoin(projects, eq(projects.id, permits.project_id))
    .leftJoin(users, and(eq(users.id, permits.responsible_user_id), eq(users.tenant_id, profile.tenantId)))
    .where(eq(permits.tenant_id, profile.tenantId))
    .orderBy(desc(permits.last_status_change_at))
    .limit(200)

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Pre-Construction</p>
        <h1 className="page-title">Permits</h1>
        <p className="page-subtitle">
          Permits, CARI, bonds, and external-return dates with ownership and escalation tracking.
        </p>
      </div>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{rows.length} permit{rows.length === 1 ? '' : 's'}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="card-empty">No permits filed yet. Create one from any project detail page.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Type</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Expected return</th>
                <th>Responsible</th>
                <th>Days at risk</th>
                <th>Last update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const daysSinceUpdate = Math.floor(
                  (Date.now() - new Date(p.last_status_change_at).getTime()) / 86_400_000
                )
                const isStale = daysSinceUpdate > 7 && !['approved', 'rejected', 'released', 'refunded', 'cancelled'].includes(p.status)
                const expectedReturn = p.expected_return_at ?? p.expected_approval_at
                const daysAtRisk = expectedReturn
                  ? Math.max(0, Math.ceil((Date.now() - new Date(expectedReturn).getTime()) / 86_400_000))
                  : null
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/projects/${p.project_id}`} style={{ color: 'inherit' }}>
                        {p.project_name}
                      </Link>
                    </td>
                    <td>{TYPE_LABEL[p.permit_type] ?? p.permit_type}</td>
                    <td>
                      <span className={STATUS_BADGE[p.status] ?? 'stage-badge'}>
                        <span className="stage-badge-dot" />
                        {p.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="muted">
                      {p.submitted_at
                        ? new Date(p.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td className="muted">
                      {expectedReturn
                        ? new Date(expectedReturn).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                        : 'â€”'}
                    </td>
                    <td className="muted">{p.responsible_name ?? 'Unassigned'}</td>
                    <td style={daysAtRisk !== null && daysAtRisk > 0 ? { color: 'var(--color-danger)', fontWeight: 600 } : { color: 'var(--color-neutral-500)' }}>
                      {daysAtRisk === null ? 'No forecast' : daysAtRisk > 0 ? `${daysAtRisk}d overdue` : '0d'}
                    </td>
                    <td style={isStale ? { color: 'var(--color-warning)', fontWeight: 500 } : { color: 'var(--color-neutral-500)' }}>
                      {daysSinceUpdate}d
                      {isStale && ' ⚠'}
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
