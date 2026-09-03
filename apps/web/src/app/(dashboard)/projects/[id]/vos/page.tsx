import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projects } from '@third-code-erp/database/schema'
import { VoCreateForm } from '@/components/vos/vo-create-form'
import { listProjectVos } from './actions'

export const metadata: Metadata = { title: 'Variation Orders' }

interface PageProps {
  params: Promise<{ id: string }>
}

const STATUS_BADGE: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'stage-badge stage-opportunity_creation' },
  pending_commercial_pricing: {
    label: 'Pending commercial',
    tone: 'stage-badge stage-resubmission',
  },
  pending_client_signature: {
    label: 'Pending signature',
    tone: 'stage-badge stage-negotiation',
  },
  signed: { label: 'Signed', tone: 'stage-badge stage-closed_won' },
  rejected: { label: 'Rejected', tone: 'stage-badge stage-closed_lost' },
}

const CHANGE_TYPE_LABEL: Record<string, string> = {
  client_initiated: 'Client-initiated',
  site_condition: 'Site condition',
  design_error: 'Design error',
}

function formatPhp(cents: number): string {
  const value = (cents / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return cents < 0 ? `−₱${value.replace('-', '')}` : `₱${value}`
}

export default async function ProjectVosPage({ params }: PageProps) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await requireUserProfile()
  const canCreate = can(profile.role, 'variation_order.create')

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)

  if (!project) notFound()

  const { rows, totals } = await listProjectVos(id, profile.tenantId)

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link
            href={`/projects/${id}`}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            Projects · {project.name}
          </Link>
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">Variation Orders</h1>
            <p className="page-subtitle">
              Track scope changes, capture commercial pricing, and route to client signature.
            </p>
          </div>
        </div>
      </div>

      <div className="section-grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">All VOs ({rows.length})</h2>
          </div>
          {rows.length === 0 ? (
            <div className="card-empty">No VOs yet — capture scope changes here.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>VO #</th>
                  <th>Description</th>
                  <th>Change type</th>
                  <th className="numeric">Cost impact</th>
                  <th className="numeric">Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((vo) => {
                  const badge = STATUS_BADGE[vo.status] ?? STATUS_BADGE.draft!
                  return (
                    <tr key={vo.id}>
                      <td className="row-leader">
                        <Link
                          href={`/projects/${id}/vos/${vo.id}`}
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {vo.vo_number}
                        </Link>
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <span
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {vo.description}
                        </span>
                      </td>
                      <td className="muted">
                        {CHANGE_TYPE_LABEL[vo.change_type] ?? vo.change_type}
                      </td>
                      <td className="numeric currency">
                        {formatPhp(vo.cost_impact_cents)}
                      </td>
                      <td className="numeric">
                        {vo.time_impact_days > 0 ? `+${vo.time_impact_days}` : vo.time_impact_days}d
                      </td>
                      <td>
                        <span className={badge.tone}>
                          <span className="stage-badge-dot" /> {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ fontWeight: 600 }}>
                    Cumulative
                  </td>
                  <td className="numeric currency" style={{ fontWeight: 600 }}>
                    {formatPhp(totals.cost_impact_cents)}
                  </td>
                  <td className="numeric" style={{ fontWeight: 600 }}>
                    {totals.time_impact_days > 0
                      ? `+${totals.time_impact_days}`
                      : totals.time_impact_days}
                    d
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {canCreate && (
        <aside>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">New variation order</h2>
            </div>
            <div style={{ padding: 16 }}>
              <VoCreateForm projectId={id} />
            </div>
          </div>
        </aside>
        )}
      </div>
    </div>
  )
}
