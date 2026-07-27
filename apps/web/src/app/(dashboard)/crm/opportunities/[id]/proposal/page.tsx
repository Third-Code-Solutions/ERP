import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, desc } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  opportunities,
  accounts,
  pprfSubmissions,
  siteInspections,
  designFiles,
  changeRequests,
} from '@third-code-erp/database/schema'
import { ProposalSubNav } from '@/components/proposal/sub-nav'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProposalOverviewPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [opp] = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      account_id: opportunities.account_id,
      account_name: accounts.name,
    })
    .from(opportunities)
    .leftJoin(accounts, eq(opportunities.account_id, accounts.id))
    .where(and(eq(opportunities.id, id), eq(opportunities.tenant_id, profile.tenantId)))
    .limit(1)
  if (!opp) notFound()

  const [pprfRows, inspections, designs, crs] = await Promise.all([
    db
      .select({
        version: pprfSubmissions.version,
        submitted_at: pprfSubmissions.submitted_at,
      })
      .from(pprfSubmissions)
      .where(eq(pprfSubmissions.opportunity_id, id))
      .orderBy(desc(pprfSubmissions.version)),
    db
      .select({
        id: siteInspections.id,
        status: siteInspections.status,
        submitted_at: siteInspections.submitted_at,
      })
      .from(siteInspections)
      .where(eq(siteInspections.opportunity_id, id))
      .orderBy(desc(siteInspections.created_at)),
    db
      .select({
        id: designFiles.id,
        name: designFiles.name,
        file_type: designFiles.file_type,
        is_ready_for_presentation: designFiles.is_ready_for_presentation,
        is_client_approved: designFiles.is_client_approved,
      })
      .from(designFiles)
      .where(eq(designFiles.opportunity_id, id))
      .orderBy(desc(designFiles.created_at)),
    db
      .select({ id: changeRequests.id, resolved_at: changeRequests.resolved_at, priority: changeRequests.priority })
      .from(changeRequests)
      .where(eq(changeRequests.opportunity_id, id))
      .orderBy(desc(changeRequests.created_at)),
  ])

  const latestPprf = pprfRows[0]
  const latestInspection = inspections[0]
  const approvedDesigns = designs.filter((d) => d.is_client_approved).length
  const openCrs = crs.filter((c) => !c.resolved_at).length

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href={`/crm/opportunities/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {opp.account_name ?? 'Opportunity'}
          </Link>
          {' · Proposal'}
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">Proposal workspace</h1>
            <p className="page-subtitle">
              {latestPprf ? `✓ PPRF v${latestPprf.version}` : '· PPRF not submitted'}
              {' · '}
              {latestInspection?.status === 'submitted' ? '✓ Inspection done' : '· Inspection pending'}
              {' · '}
              {designs.length} design{designs.length === 1 ? '' : 's'}
              {' · '}
              {openCrs} CR{openCrs === 1 ? '' : 's'} open
            </p>
          </div>
        </div>
      </div>

      <ProposalSubNav opportunityId={id} />

      <div className="section-grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">PPRF</h2>
          </div>
          {pprfRows.length === 0 ? (
            <div className="card-empty">No PPRF submitted yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {pprfRows.slice(0, 3).map((r) => (
                  <tr key={r.version}>
                    <td>v{r.version}</td>
                    <td className="muted">
                      {r.submitted_at
                        ? new Date(r.submitted_at).toLocaleDateString('en-PH', {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ padding: 12, borderTop: '1px solid var(--color-border)' }}>
            <Link href={`/crm/opportunities/${id}/proposal/pprf`} className="link-primary">
              Open PPRF →
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Site inspection</h2>
          </div>
          {!latestInspection ? (
            <div className="card-empty">No inspection logged yet.</div>
          ) : (
            <div style={{ padding: 16, fontSize: 13 }}>
              Status: <strong>{latestInspection.status}</strong>
              {latestInspection.submitted_at && (
                <> · Submitted{' '}
                  {new Date(latestInspection.submitted_at).toLocaleDateString('en-PH', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </>
              )}
            </div>
          )}
          <div style={{ padding: 12, borderTop: '1px solid var(--color-border)' }}>
            <Link href={`/crm/opportunities/${id}/proposal/inspection`} className="link-primary">
              Open inspection →
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Design files ({designs.length})</h2>
            <p className="card-subtitle">{approvedDesigns} approved</p>
          </div>
          {designs.length === 0 ? (
            <div className="card-empty">No designs uploaded yet.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {designs.slice(0, 5).map((d) => (
                <li
                  key={d.id}
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 13,
                  }}
                >
                  <span>
                    <strong>{d.name}</strong>{' '}
                    <span style={{ color: 'var(--color-neutral-500)' }}>· {d.file_type.replace(/_/g, ' ')}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                    {d.is_client_approved ? 'Approved' : d.is_ready_for_presentation ? 'Ready' : 'Draft'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ padding: 12, borderTop: '1px solid var(--color-border)' }}>
            <Link href={`/crm/opportunities/${id}/proposal/design`} className="link-primary">
              Open designs →
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Change requests ({crs.length})</h2>
            <p className="card-subtitle">{openCrs} open</p>
          </div>
          {crs.length === 0 ? (
            <div className="card-empty">No change requests logged.</div>
          ) : (
            <table className="data-table">
              <tbody>
                {crs.slice(0, 5).map((c) => (
                  <tr key={c.id}>
                    <td>{c.priority}</td>
                    <td className="muted">{c.resolved_at ? 'Resolved' : 'Open'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ padding: 12, borderTop: '1px solid var(--color-border)' }}>
            <Link href={`/crm/opportunities/${id}/proposal/change-requests`} className="link-primary">
              Open change requests →
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        .link-primary {
          font-size: 13px;
          font-weight: 500;
          color: var(--color-navy-700);
          text-decoration: none;
        }
        .link-primary:hover { text-decoration: underline; }
      `}</style>
    </div>
  )
}
