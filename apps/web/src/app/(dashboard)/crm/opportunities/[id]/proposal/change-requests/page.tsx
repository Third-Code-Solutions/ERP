import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { notFound } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  changeLogs,
  changeRequests,
  designFileVersions,
  designFiles,
  opportunities,
  users,
} from '@third-code-erp/database/schema'
import { ProposalSubNav } from '@/components/proposal/sub-nav'
import { ChangeRequestForm } from '@/components/proposal/change-request-form'
import { ResolveChangeRequestButton } from '@/components/proposal/resolve-change-request-button'

interface PageProps {
  params: Promise<{ id: string }>
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value)
}

export default async function ChangeRequestsPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [opp] = await db
    .select({
      id: opportunities.id,
      account_name: accounts.name,
    })
    .from(opportunities)
    .leftJoin(accounts, eq(opportunities.account_id, accounts.id))
    .where(and(eq(opportunities.id, id), eq(opportunities.tenant_id, profile.tenantId)))
    .limit(1)
  if (!opp) notFound()

  const [crs, designOptions, logs] = await Promise.all([
    db
      .select({
        id: changeRequests.id,
        requested_by_name: changeRequests.requested_by_name,
        description: changeRequests.description,
        priority: changeRequests.priority,
        resolved_at: changeRequests.resolved_at,
        resolved_by_name: users.full_name,
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
      .leftJoin(
        users,
        and(eq(users.id, changeRequests.resolved_by), eq(users.tenant_id, profile.tenantId)),
      )
      .where(
        and(
          eq(changeRequests.opportunity_id, id),
          eq(changeRequests.tenant_id, profile.tenantId),
        ),
      )
      .orderBy(desc(changeRequests.created_at)),
    db
      .select({
        id: designFiles.id,
        name: designFiles.name,
        file_type: designFiles.file_type,
      })
      .from(designFiles)
      .where(and(eq(designFiles.opportunity_id, id), eq(designFiles.tenant_id, profile.tenantId)))
      .orderBy(desc(designFiles.created_at)),
    db
      .select({
        id: changeLogs.id,
        change_request_id: changeLogs.change_request_id,
        event_type: changeLogs.event_type,
        note: changeLogs.note,
        created_at: changeLogs.created_at,
        version: designFileVersions.version,
        design_file_name: designFiles.name,
      })
      .from(changeLogs)
      .innerJoin(
        changeRequests,
        and(
          eq(changeRequests.id, changeLogs.change_request_id),
          eq(changeRequests.tenant_id, profile.tenantId),
        ),
      )
      .leftJoin(
        designFileVersions,
        and(
          eq(designFileVersions.id, changeLogs.design_file_version_id),
          eq(designFileVersions.tenant_id, profile.tenantId),
        ),
      )
      .leftJoin(
        designFiles,
        and(
          eq(designFiles.id, designFileVersions.design_file_id),
          eq(designFiles.tenant_id, profile.tenantId),
        ),
      )
      .where(
        and(
          eq(changeLogs.tenant_id, profile.tenantId),
          eq(changeRequests.opportunity_id, id),
        ),
      )
      .orderBy(desc(changeLogs.created_at)),
  ])

  const openCount = crs.filter((request) => !request.resolved_at).length
  const canResolve = can(profile.role, 'design.upload')
  const logsByRequest = new Map<string, (typeof logs)[number][]>()
  for (const log of logs) {
    const requestLogs = logsByRequest.get(log.change_request_id) ?? []
    requestLogs.push(log)
    logsByRequest.set(log.change_request_id, requestLogs)
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href={`/crm/opportunities/${id}/proposal`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {opp.account_name ?? 'Opportunity'} - Proposal
          </Link>
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">Change requests</h1>
            <p className="page-subtitle">{crs.length} total - {openCount} open</p>
          </div>
        </div>
      </div>

      <ProposalSubNav opportunityId={id} />

      <div className="section-grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Change log</h2>
            <p className="card-subtitle">Every request and resolution is recorded.</p>
          </div>
          {crs.length === 0 ? (
            <div className="card-empty">No change requests logged yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Requested by</th>
                    <th>Description</th>
                    <th>Affects</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>History</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {crs.map((request) => (
                    <tr key={request.id}>
                      <td className="muted">{formatDate(new Date(request.created_at))}</td>
                      <td>{request.requested_by_name ?? '-'}</td>
                      <td style={{ maxWidth: 280 }}>{request.description}</td>
                      <td className="muted">
                        {request.affected_design_name ?? '-'}
                        {request.affected_design_file_id && (
                          <div style={{ fontSize: 11 }}>Latest version captured</div>
                        )}
                      </td>
                      <td>
                        <span
                          className="stage-badge"
                          style={{
                            background: request.priority === 'major' ? '#ffedd5' : '#f3f4f6',
                            color: request.priority === 'major' ? '#c2410c' : '#6b7280',
                          }}
                        >
                          <span className="stage-badge-dot" />{request.priority}
                        </span>
                      </td>
                      <td className="muted">
                        {request.resolved_at ? 'Resolved' : 'Open'}
                        {request.resolved_by_name && (
                          <div style={{ fontSize: 11 }}>by {request.resolved_by_name}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 160 }}>
                          {(logsByRequest.get(request.id) ?? []).map((log) => (
                            <div key={log.id} style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>
                              <strong>{log.event_type === 'created' ? 'Logged' : 'Resolved'}</strong>
                              {log.version
                                ? ` - ${log.design_file_name ?? 'Design'} v${log.version}`
                                : ' - general feedback'}
                              {log.note && log.event_type === 'resolved' && ` - ${log.note}`}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        {!request.resolved_at && canResolve && (
                          <ResolveChangeRequestButton changeRequestId={request.id} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Log change request</h2>
              <p className="card-subtitle">Capture the client request against the latest design version.</p>
            </div>
            <div style={{ padding: 16 }}>
              <ChangeRequestForm
                opportunityId={id}
                idempotencyKey={randomUUID()}
                designOptions={designOptions.map((design) => ({
                  id: design.id,
                  name: `${design.name} (${design.file_type.replace(/_/g, ' ')})`,
                }))}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
