import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, desc } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  opportunities,
  accounts,
  changeRequests,
  designFiles,
} from '@third-code-erp/database/schema'
import { ProposalSubNav } from '@/components/proposal/sub-nav'
import { ChangeRequestForm } from '@/components/proposal/change-request-form'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ChangeRequestsPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [opp] = await db
    .select({
      id: opportunities.id,
      account_id: opportunities.account_id,
      account_name: accounts.name,
    })
    .from(opportunities)
    .leftJoin(
      accounts,
      and(
        eq(opportunities.account_id, accounts.id),
        eq(accounts.tenant_id, profile.tenantId),
      ),
    )
    .where(and(eq(opportunities.id, id), eq(opportunities.tenant_id, profile.tenantId)))
    .limit(1)
  if (!opp) notFound()

  const [crs, designOptions] = await Promise.all([
    db
      .select({
        id: changeRequests.id,
        requested_by_name: changeRequests.requested_by_name,
        description: changeRequests.description,
        priority: changeRequests.priority,
        resolved_at: changeRequests.resolved_at,
        affected_design_file_id: changeRequests.affected_design_file_id,
        created_at: changeRequests.created_at,
        affected_design_name: designFiles.name,
      })
      .from(changeRequests)
      .leftJoin(
        designFiles,
        and(
          eq(designFiles.id, changeRequests.affected_design_file_id),
          eq(designFiles.tenant_id, profile.tenantId),
        ),
      )
      .where(
        and(
          eq(changeRequests.opportunity_id, id),
          eq(changeRequests.tenant_id, profile.tenantId),
        ),
      )
      .orderBy(desc(changeRequests.created_at)),
    db
      .select({ id: designFiles.id, name: designFiles.name, file_type: designFiles.file_type })
      .from(designFiles)
      .where(
        and(
          eq(designFiles.opportunity_id, id),
          eq(designFiles.tenant_id, profile.tenantId),
        ),
      )
      .orderBy(desc(designFiles.created_at)),
  ])

  const openCount = crs.filter((c) => !c.resolved_at).length

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href={`/crm/opportunities/${id}/proposal`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {opp.account_name ?? 'Opportunity'} · Proposal
          </Link>
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">Change requests</h1>
            <p className="page-subtitle">
              {crs.length} total · {openCount} open
            </p>
          </div>
        </div>
      </div>

      <ProposalSubNav opportunityId={id} />

      <div className="section-grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Log</h2>
          </div>
          {crs.length === 0 ? (
            <div className="card-empty">No change requests logged yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Requested by</th>
                  <th>Description</th>
                  <th>Affects</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {crs.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">
                      {new Date(c.created_at).toLocaleDateString('en-PH', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </td>
                    <td>{c.requested_by_name ?? '—'}</td>
                    <td>{c.description}</td>
                    <td className="muted">{c.affected_design_name ?? '—'}</td>
                    <td>
                      <span
                        className="stage-badge"
                        style={{
                          background: c.priority === 'major' ? '#ffedd5' : '#f3f4f6',
                          color: c.priority === 'major' ? '#c2410c' : '#6b7280',
                        }}
                      >
                        <span className="stage-badge-dot" />{c.priority}
                      </span>
                    </td>
                    <td className="muted">{c.resolved_at ? 'Resolved' : 'Open'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Log change request</h2>
            </div>
            <div style={{ padding: 16 }}>
              <ChangeRequestForm
                opportunityId={id}
                designOptions={designOptions.map((d) => ({
                  id: d.id,
                  name: `${d.name} (${d.file_type.replace(/_/g, ' ')})`,
                }))}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
