import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { notFound } from 'next/navigation'
import { and, eq, desc } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  opportunities,
  accounts,
  pprfSubmissions,
  opportunityKycTracks,
} from '@third-code-erp/database/schema'
import { ProposalSubNav } from '@/components/proposal/sub-nav'
import { PprfForm } from '@/components/proposal/pprf-form'
import { pprfPayloadSchema } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/schemas'
import { OpportunityKycTrackPanel } from '@/components/proposal/opportunity-kyc-track-panel'

interface PageProps {
  params: Promise<{ id: string }>
}

const EMPTY_DEFAULTS: {
  site_address: string
  floor_area_sqm: string
  landlord_contact: string
  as_built_available: 'yes' | 'no' | 'partial'
  scope_notes: string
  project_type: string
  expected_start_date: string
  budget_range: string
} = {
  site_address: '',
  floor_area_sqm: '',
  landlord_contact: '',
  as_built_available: 'no',
  scope_notes: '',
  project_type: '',
  expected_start_date: '',
  budget_range: '',
}

export default async function PprfPage({ params }: PageProps) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await requireUserProfile()

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

  const [history, tracks] = await Promise.all([
    db
      .select({
        id: pprfSubmissions.id,
        version: pprfSubmissions.version,
        submitted_at: pprfSubmissions.submitted_at,
        payload: pprfSubmissions.payload,
      })
      .from(pprfSubmissions)
      .where(
        and(
          eq(pprfSubmissions.opportunity_id, id),
          eq(pprfSubmissions.tenant_id, profile.tenantId)
        )
      )
      .orderBy(desc(pprfSubmissions.version)),
    db
      .select({
        id: opportunityKycTracks.id,
        track_type: opportunityKycTracks.track_type,
        status: opportunityKycTracks.status,
        due_at: opportunityKycTracks.due_at,
        prepared_at: opportunityKycTracks.prepared_at,
        fc_recommended_at: opportunityKycTracks.fc_recommended_at,
        president_decided_at: opportunityKycTracks.president_decided_at,
        decision_reason: opportunityKycTracks.decision_reason,
        notes: opportunityKycTracks.notes,
      })
      .from(opportunityKycTracks)
      .where(
        and(
          eq(opportunityKycTracks.opportunity_id, id),
          eq(opportunityKycTracks.tenant_id, profile.tenantId)
        )
      )
      .orderBy(opportunityKycTracks.track_type),
  ])

  const latest = history[0]
  const canSubmit = can(profile.role, 'pprf.submit')
  const submissionId = canSubmit ? randomUUID() : null
  // Parse latest payload into the typed form defaults. If parse fails (e.g.
  // an older row without scope_notes), fall back to the empty template.
  let defaults = EMPTY_DEFAULTS
  if (latest) {
    const parsed = pprfPayloadSchema.safeParse(latest.payload)
    if (parsed.success) {
      defaults = {
        site_address: parsed.data.site_address,
        floor_area_sqm: String(parsed.data.floor_area_sqm),
        landlord_contact: parsed.data.landlord_contact,
        as_built_available: parsed.data.as_built_available,
        scope_notes: parsed.data.scope_notes ?? '',
        project_type: parsed.data.project_type ?? '',
        expected_start_date: parsed.data.expected_start_date ?? '',
        budget_range: parsed.data.budget_range ?? '',
      }
    }
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
            <h1 className="page-title">Project Pre-Requirements Form</h1>
            <p className="page-subtitle">
              Submitting a new form creates a new versioned row. Commercial and Finance get notified.
            </p>
          </div>
        </div>
      </div>

      <ProposalSubNav opportunityId={id} />

      <div className="section-grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {latest ? `Edit & resubmit (next: v${latest.version + 1})` : 'Submit PPRF v1'}
            </h2>
          </div>
          <div style={{ padding: 16 }}>
            {submissionId ? (
              <PprfForm
                key={submissionId}
                opportunityId={id}
                submissionId={submissionId}
                defaults={defaults}
              />
            ) : (
              <div className="card-empty">
                You can review prior PPRF versions, but your role cannot submit a new version.
              </div>
            )}
          </div>
          <OpportunityKycTrackPanel
            opportunityId={id}
            tracks={tracks.map((track) => ({
              ...track,
              due_at: track.due_at.toISOString(),
              prepared_at: track.prepared_at?.toISOString() ?? null,
              fc_recommended_at: track.fc_recommended_at?.toISOString() ?? null,
              president_decided_at: track.president_decided_at?.toISOString() ?? null,
            }))}
            canManage={can(profile.role, 'opportunity.kyc_track_manage')}
            canApprove={can(profile.role, 'opportunity.kyc_track_approve')}
          />
        </div>

        <aside>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Version history ({history.length})</h2>
            </div>
            {history.length === 0 ? (
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
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>v{h.version}</td>
                      <td className="muted">
                        {h.submitted_at
                          ? new Date(h.submitted_at).toLocaleString('en-PH', {
                              year: 'numeric', month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
