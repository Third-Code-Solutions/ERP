import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import { randomUUID } from 'node:crypto'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, desc } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  opportunities,
  accounts,
  pprfSubmissions,
  siteInspections,
  siteInspectionPhotos,
  siteInspectionRfis,
  documents,
} from '@third-code-erp/database/schema'
import { ProposalSubNav } from '@/components/proposal/sub-nav'
import { InspectionForm } from '@/components/proposal/inspection-form'
import { RfiForm } from '@/components/proposal/rfi-form'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function InspectionPage({ params }: PageProps) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await requireUserProfile()
  const canSubmit = can(profile.role, 'site_inspection.submit')

  const [opp] = await db
    .select({
      id: opportunities.id,
      account_id: opportunities.account_id,
      account_name: accounts.name,
    })
    .from(opportunities)
    .leftJoin(accounts, eq(opportunities.account_id, accounts.id))
    .where(and(eq(opportunities.id, id), eq(opportunities.tenant_id, profile.tenantId)))
    .limit(1)
  if (!opp) notFound()

  const [latestPprfRow] = await db
    .select({ id: pprfSubmissions.id, payload: pprfSubmissions.payload })
    .from(pprfSubmissions)
    .where(
      and(
        eq(pprfSubmissions.opportunity_id, id),
        eq(pprfSubmissions.tenant_id, profile.tenantId),
      ),
    )
    .orderBy(desc(pprfSubmissions.version))
    .limit(1)
  const pprfSubmitted = !!latestPprfRow

  const inspections = await db
    .select({
      id: siteInspections.id,
      status: siteInspections.status,
      payload: siteInspections.payload,
      pdf_document_id: siteInspections.pdf_document_id,
      submitted_at: siteInspections.submitted_at,
    })
    .from(siteInspections)
    .where(
      and(
        eq(siteInspections.opportunity_id, id),
        eq(siteInspections.tenant_id, profile.tenantId),
      ),
    )
    .orderBy(desc(siteInspections.created_at))

  const latest = inspections[0]
  const rfiSubmissionId = canSubmit && latest ? randomUUID() : null

  // For the latest inspection, pull photos + RFIs.
  let photos: { id: string; document_id: string; file_name: string | null }[] = []
  let rfis: { id: string; description: string; priority: 'minor' | 'major'; resolved_at: Date | null }[] = []
  let pdfFile: { file_name: string | null } | null = null
  if (latest) {
    const photoRows = await db
      .select({
        id: siteInspectionPhotos.id,
        document_id: siteInspectionPhotos.document_id,
        file_name: documents.file_name,
      })
      .from(siteInspectionPhotos)
      .leftJoin(documents, eq(documents.id, siteInspectionPhotos.document_id))
      .where(
        and(
          eq(siteInspectionPhotos.inspection_id, latest.id),
          eq(siteInspectionPhotos.tenant_id, profile.tenantId),
        ),
      )
    photos = photoRows

    const rfiRows = await db
      .select({
        id: siteInspectionRfis.id,
        description: siteInspectionRfis.description,
        priority: siteInspectionRfis.priority,
        resolved_at: siteInspectionRfis.resolved_at,
      })
      .from(siteInspectionRfis)
      .where(
        and(
          eq(siteInspectionRfis.inspection_id, latest.id),
          eq(siteInspectionRfis.tenant_id, profile.tenantId),
        ),
      )
      .orderBy(desc(siteInspectionRfis.created_at))
    rfis = rfiRows

    if (latest.pdf_document_id) {
      const [doc] = await db
        .select({ file_name: documents.file_name })
        .from(documents)
        .where(
          and(
            eq(documents.id, latest.pdf_document_id),
            eq(documents.tenant_id, profile.tenantId),
          ),
        )
        .limit(1)
      pdfFile = doc ?? null
    }
  }

  const pprfPayload =
    latestPprfRow &&
    typeof latestPprfRow.payload === 'object' &&
    latestPprfRow.payload !== null
      ? (latestPprfRow.payload as Record<string, unknown>)
      : {}
  const pprfDefaults = {
    site_address: String(pprfPayload.site_address ?? ''),
    floor_area_sqm: String(pprfPayload.floor_area_sqm ?? ''),
    landlord_contact: String(pprfPayload.landlord_contact ?? ''),
    as_built_available: String(pprfPayload.as_built_available ?? 'no'),
    expected_start_date: String(pprfPayload.expected_start_date ?? ''),
    scope_notes: String(pprfPayload.scope_notes ?? ''),
  }

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
            <h1 className="page-title">Site inspection</h1>
            <p className="page-subtitle">
              Commercial captures site reality so Design can begin layouts.
            </p>
          </div>
        </div>
      </div>

      <ProposalSubNav opportunityId={id} />

      <div className="section-grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Log inspection</h2>
          </div>
          <div style={{ padding: 16 }}>
            {canSubmit ? (
              <InspectionForm
                opportunityId={id}
                pprfSubmitted={pprfSubmitted}
                defaults={pprfDefaults}
              />
            ) : (
              <div className="card-empty" role="note">
                You can review inspection history, but your role cannot submit inspections.
              </div>
            )}
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!latest ? (
            <div className="card">
              <div className="card-empty">No inspection submitted yet.</div>
            </div>
          ) : (
            <>
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Latest inspection</h2>
                  <p className="card-subtitle">
                    Status: {latest.status}
                    {latest.submitted_at && (
                      <>
                        {' '}·{' '}
                        {new Date(latest.submitted_at).toLocaleString('en-PH', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </>
                    )}
                  </p>
                </div>
                <div style={{ padding: 16, fontSize: 13 }}>
                  {pdfFile ? (
                    <p>Inspection PDF: <strong>{pdfFile.file_name ?? 'document'}</strong></p>
                  ) : (
                    <p style={{ color: 'var(--color-neutral-500)' }}>PDF not generated yet.</p>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Photos ({photos.length})</h2>
                </div>
                {photos.length === 0 ? (
                  <div className="card-empty">No photos attached.</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {photos.map((p) => (
                      <li
                        key={p.id}
                        style={{
                          padding: '8px 14px',
                          borderBottom: '1px solid var(--color-border)',
                          fontSize: 13,
                        }}
                      >
                        {p.file_name ?? p.document_id}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">RFIs ({rfis.length})</h2>
                </div>
                {rfis.length === 0 ? (
                  <div className="card-empty">No RFIs logged.</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Priority</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rfis.map((r) => (
                        <tr key={r.id}>
                          <td>{r.description}</td>
                          <td>{r.priority}</td>
                          <td className="muted">{r.resolved_at ? 'Resolved' : 'Open'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ padding: 12, borderTop: '1px solid var(--color-border)' }}>
                  {canSubmit && rfiSubmissionId ? (
                    <RfiForm
                      opportunityId={id}
                      inspectionId={latest.id}
                      submissionId={rfiSubmissionId}
                    />
                  ) : (
                    <p className="card-empty" role="note">
                      You can review inspection history and RFIs, but your role cannot add RFIs.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
