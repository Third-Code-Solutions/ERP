import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  opportunities,
  projects,
  slaLogs,
  users,
  opportunityKycTracks,
} from '@third-code-erp/database/schema'
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm'
import { PipelineBoard } from '@/components/pipeline/pipeline-board'
import { opportunityKycGateMessage } from '@/lib/operations/opportunity-kyc'

export const metadata: Metadata = { title: 'Pipeline Board' }

// Force dynamic — kanban board is per-tenant and must reflect realtime state.
export const dynamic = 'force-dynamic'

export default async function PipelineBoardPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'opportunity.read')
  const tenantId = profile.tenantId

  // Fetch everything in parallel — kanban needs opps + accounts (for KYC
  // gating + display) + open SLA logs (for the dot) + reps + projects/accounts
  // for the quick-add modal.
  const [oppsRaw, accountsList, projectsList, openSlas, kycTracksRaw] = await Promise.all([
    db
      .select({
        id: opportunities.id,
        stage: opportunities.stage,
        tcv_cents: opportunities.tcv_cents,
        gp_cents: opportunities.gp_cents,
        weighted_tcv_cents: opportunities.weighted_tcv_cents,
        probability: opportunities.probability,
        updated_at: opportunities.updated_at,
        created_at: opportunities.created_at,
        account_id: opportunities.account_id,
        account_name: accounts.name,
        account_kyc_status: accounts.kyc_status,
        project_id: projects.id,
        project_name: projects.name,
        rep_id: opportunities.rep_id,
        rep_email: users.email,
      })
      .from(opportunities)
      .leftJoin(
        accounts,
        and(
          eq(opportunities.account_id, accounts.id),
          eq(accounts.tenant_id, tenantId)
        )
      )
      .leftJoin(
        projects,
        and(
          eq(opportunities.project_id, projects.id),
          eq(projects.tenant_id, tenantId)
        )
      )
      .leftJoin(
        users,
        and(eq(opportunities.rep_id, users.id), eq(users.tenant_id, tenantId))
      )
      .where(
        and(
          eq(opportunities.tenant_id, tenantId),
          or(isNull(opportunities.project_id), isNull(projects.deleted_at))
        )
      )
      .orderBy(desc(opportunities.updated_at)),
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        kyc_status: accounts.kyc_status,
      })
      .from(accounts)
      .where(eq(accounts.tenant_id, tenantId))
      .orderBy(asc(accounts.name)),
    db
      .select({ id: projects.id, name: projects.name, client: projects.client })
      .from(projects)
      .where(
        and(eq(projects.tenant_id, tenantId), isNull(projects.deleted_at))
      )
      .orderBy(asc(projects.name)),
    db
      .select({
        entity_id: slaLogs.entity_id,
        started_at: slaLogs.started_at,
        warned_at: slaLogs.warned_at,
        breached_at: slaLogs.breached_at,
        sla_label: slaLogs.sla_label,
      })
      .from(slaLogs)
      .where(
        and(
          eq(slaLogs.tenant_id, tenantId),
          eq(slaLogs.entity_type, 'opportunity'),
          eq(slaLogs.sla_label, 'opp.stage_response'),
          isNull(slaLogs.completed_at)
        )
      ),
    db
      .select({
        opportunity_id: opportunityKycTracks.opportunity_id,
        track_type: opportunityKycTracks.track_type,
        status: opportunityKycTracks.status,
        decision_reason: opportunityKycTracks.decision_reason,
      })
      .from(opportunityKycTracks)
      .where(eq(opportunityKycTracks.tenant_id, tenantId)),
  ])

  // Build a quick lookup so the client component can render an SLA dot
  // without a second round trip.
  const slaByOpp = new Map<string, 'green' | 'amber' | 'red'>()
  for (const row of openSlas) {
    let level: 'green' | 'amber' | 'red' = 'green'
    if (row.breached_at) level = 'red'
    else if (row.warned_at) level = 'amber'
    slaByOpp.set(row.entity_id, level)
  }

  const tracksByOpportunity = new Map<string, typeof kycTracksRaw>()
  for (const row of kycTracksRaw) {
    const tracks = tracksByOpportunity.get(row.opportunity_id) ?? []
    tracks.push(row)
    tracksByOpportunity.set(row.opportunity_id, tracks)
  }

  const cards = oppsRaw.map((o) => ({
    id: o.id,
    stage: o.stage,
    tcv_cents: o.tcv_cents,
    gp_cents: o.gp_cents,
    weighted_tcv_cents: o.weighted_tcv_cents,
    probability: o.probability,
    updated_at:
      o.updated_at instanceof Date ? o.updated_at.toISOString() : String(o.updated_at),
    created_at:
      o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at),
    account_id: o.account_id,
    account_name: o.account_name,
    account_kyc_status: o.account_kyc_status,
    project_id: o.project_id,
    project_name: o.project_name,
    rep_id: o.rep_id,
    rep_email: o.rep_email,
    opportunity_kyc_initialized: tracksByOpportunity.has(o.id),
    opportunity_kyc_gate: tracksByOpportunity.has(o.id)
      ? opportunityKycGateMessage(tracksByOpportunity.get(o.id) ?? [])
      : null,
    sla: slaByOpp.get(o.id) ?? null,
  }))

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Pipeline Board</h1>
          <p className="page-subtitle">
            {cards.length} active opportunit{cards.length === 1 ? 'y' : 'ies'} · drag to advance
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link
            href="/pipeline/conversion"
            style={{
              padding: '7px 14px',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--color-neutral-700)',
              textDecoration: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              background: 'white',
            }}
          >
            List view
          </Link>
        </div>
      </div>

      <PipelineBoard
        cards={cards}
        accounts={accountsList}
        projects={projectsList}
        canCreateOpportunity={can(profile.role, 'opportunity.create')}
        canAdvanceOpportunity={can(profile.role, 'opportunity.advance_stage')}
      />
    </div>
  )
}
