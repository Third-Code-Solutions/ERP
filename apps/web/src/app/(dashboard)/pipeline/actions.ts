'use server'

import { revalidatePath } from 'next/cache'
import { can, getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { accounts, opportunities, opportunityKycTracks } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import { startSlaClock, stopSlaClock } from '@/lib/operations/sla-clock'
import {
  PIPELINE_STAGES,
  STAGE_PROBABILITY,
  STAGE_TRANSITIONS,
  STAGE_LEGACY_MAP,
  type PipelineStage,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { opportunityKycGateMessage } from '@/lib/operations/opportunity-kyc'

// Stages beyond which KYC must be approved. `lead` + `site_survey` are
// allowed pre-KYC so reps can initial-triage; everything past needs
// Finance sign-off.
const KYC_GATED_STAGES: ReadonlySet<OpportunityStage> = new Set<OpportunityStage>([
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
  // Legacy equivalents
  'resubmission',
  'closed_won',
])

// ── Create opportunity ────────────────────────────────────────────────────────

export async function createOpportunity(formData: FormData): Promise<{ error?: string }> {
  return createOpportunityForAccount(formData)
}

// ── Create opportunity for an account (ABI OPS flow) ──────────────────────────

/**
 * Create an Opportunity owned by an Account (REFACTOR.md M1 US-002).
 *
 * A Sales-created opportunity always starts in the canonical `lead` stage.
 * It records a prospective project name but deliberately does not create or
 * pre-link a delivery project; the awarded conversion owns that boundary.
 */
export async function createOpportunityForAccount(formData: FormData): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'opportunity.create')) {
    return { error: `Forbidden: role "${profile.role}" cannot create opportunities` }
  }

  const requestedStage = parseStr(formData.get('stage'))
  if (requestedStage && requestedStage !== 'lead') {
    return { error: 'New opportunities must start in the Sales Lead stage' }
  }

  const accountId = formData.get('account_id')
  if (typeof accountId !== 'string' || !accountId) return { error: 'Account is required' }

  const prospectiveProjectName = parseStr(formData.get('prospective_project_name'))
  if (!prospectiveProjectName) return { error: 'Prospective project name is required' }

  const [account] = await db
    .select({ id: accounts.id, kyc_status: accounts.kyc_status, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.tenant_id, profile.tenantId)))

  if (!account) return { error: 'Account not found' }

  const stage: PipelineStage = 'lead'

  const tcvCents = parseCents(formData.get('tcv'))
  const gpCents = parseCents(formData.get('gp'))
  const probability = STAGE_PROBABILITY[stage] ?? 10
  const weightedTcvCents = Math.round((tcvCents * probability) / 100)

  const [opp] = await db
    .insert(opportunities)
    .values({
      tenant_id: profile.tenantId,
      account_id: accountId,
      prospective_project_name: prospectiveProjectName,
      rep_id: profile.user.id,
      stage,
      tcv_cents: tcvCents,
      gp_cents: gpCents,
      probability,
      weighted_tcv_cents: weightedTcvCents,
      closing_date: parseDate(formData.get('closing_date')),
      area_sqm: parseIntOpt(formData.get('area_sqm')),
      opportunity_type: parseStr(formData.get('opportunity_type')),
      remarks: parseStr(formData.get('remarks')),
    })
    .returning({ id: opportunities.id })

  if (!opp) return { error: 'Failed to create opportunity' }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'opportunity',
    entityId: opp.id,
    action: 'create',
    diff: {
      stage,
      account_id: accountId,
      prospective_project_name: prospectiveProjectName,
      tcv_cents: tcvCents,
    },
  })

  // Start SLA clock on the initial stage so leadership can see stalled leads.
  try {
    await startSlaClock({
      tenantId: profile.tenantId,
      entityType: 'opportunity',
      entityId: opp.id,
      label: 'opp.stage_response',
    })
  } catch {
    // SLA failure is non-fatal — opp is created either way.
  }

  revalidatePath('/pipeline/board')
  revalidatePath('/pipeline/coverage')
  revalidatePath('/pipeline/conversion')
  revalidatePath('/')
  return {}
}

// ── Advance stage ─────────────────────────────────────────────────────────────

/**
 * Advance an opportunity to the next stage.
 *
 * Signature:
 *   advanceOpportunityStage(opportunityId: string, nextStage: string, lostReason?: string)
 *
 * `lostReason` is optional and only persisted when `nextStage === 'closed_lost'`.
 * It is written to `opportunities.lost_reason` and recorded in the audit log diff
 * so leadership can analyze loss patterns over time.
 *
 * Examples:
 *   await advanceOpportunityStage(id, 'negotiation')
 *   await advanceOpportunityStage(id, 'closed_lost', 'Lost to incumbent on price')
 */
export async function advanceOpportunityStage(
  opportunityId: string,
  nextStage: string,
  reason?: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'opportunity.advance_stage')) {
    return { error: `Forbidden: role "${profile.role}" cannot advance opportunities` }
  }

  const [opp] = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      tcv_cents: opportunities.tcv_cents,
      project_id: opportunities.project_id,
      account_id: opportunities.account_id,
      lost_reason: opportunities.lost_reason,
    })
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, profile.tenantId)))

  if (!opp) return { error: 'Opportunity not found' }

  const allowed = STAGE_TRANSITIONS[opp.stage as OpportunityStage] ?? []
  if (!allowed.includes(nextStage as OpportunityStage)) {
    return { error: `Cannot move from ${opp.stage} to ${nextStage}` }
  }

  // ── KYC gate (defense in depth — mirrors UI check). ─────────────────────────
  // Advancing past Site Survey requires the linked Account to have an
  // approved (or not-required) KYC status.
  const nextStageTyped = nextStage as OpportunityStage
  if (KYC_GATED_STAGES.has(nextStageTyped) && opp.account_id) {
    const [accountRows, trackRows] = await Promise.all([
      db
      .select({ kyc_status: accounts.kyc_status })
      .from(accounts)
      .where(and(eq(accounts.id, opp.account_id), eq(accounts.tenant_id, profile.tenantId)))
      .limit(1),
      db
        .select({
          track_type: opportunityKycTracks.track_type,
          status: opportunityKycTracks.status,
          decision_reason: opportunityKycTracks.decision_reason,
        })
        .from(opportunityKycTracks)
        .where(
          and(
            eq(opportunityKycTracks.opportunity_id, opportunityId),
            eq(opportunityKycTracks.tenant_id, profile.tenantId)
          )
      ),
    ])
    const account = accountRows[0]

    // New PPRF opportunities use two explicit Finance tracks. Legacy
    // opportunities without tracks retain account-level KYC compatibility.
    const dualTrackGate = opportunityKycGateMessage(trackRows)
    if (trackRows.length > 0) {
      if (dualTrackGate) return { error: dualTrackGate }
    } else {
      const kycOk = account?.kyc_status === 'approved' || account?.kyc_status === 'not_required'
      if (!kycOk) return { error: 'Account KYC must be Approved before this stage' }
    }
  }

  // ── Regression detection (US-002 AC5). ─────────────────────────────────────
  // If the new stage sits earlier in the canonical flow than the current stage,
  // require a reason.
  const trimmedReason =
    typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : undefined
  const currentPipelineStage: PipelineStage =
    STAGE_LEGACY_MAP[opp.stage as OpportunityStage] ?? 'lead'
  const nextPipelineStage: PipelineStage | undefined = STAGE_LEGACY_MAP[nextStageTyped]
  const isRegression =
    !!nextPipelineStage &&
    PIPELINE_STAGES.indexOf(nextPipelineStage) <
      PIPELINE_STAGES.indexOf(currentPipelineStage) &&
    nextPipelineStage !== 'lost'
  if (isRegression && !trimmedReason) {
    return { error: 'reason_required' }
  }

  const newProbability = STAGE_PROBABILITY[nextStageTyped] ?? 0
  const newWeightedTcv = Math.round(opp.tcv_cents * newProbability / 100)

  // Capture reason in lost_reason column on close-lost transitions; for
  // regressions we still record it in the audit diff (below) without
  // overwriting the lost_reason field.
  const isClosingLost = nextStage === 'closed_lost' || nextStage === 'lost'
  const reasonToPersist = isClosingLost ? trimmedReason ?? null : undefined

  const updateValues: {
    stage: OpportunityStage
    probability: number
    weighted_tcv_cents: number
    updated_at: Date
    lost_reason?: string | null
  } = {
    stage: nextStageTyped,
    probability: newProbability,
    weighted_tcv_cents: newWeightedTcv,
    updated_at: new Date(),
  }
  if (isClosingLost) {
    updateValues.lost_reason = reasonToPersist ?? null
  }

  await db
    .update(opportunities)
    .set(updateValues)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, profile.tenantId)))

  const auditDiff: Record<string, unknown> = {
    from: opp.stage,
    to: nextStage,
    probability: newProbability,
  }
  if (isClosingLost) {
    auditDiff.lost_reason = {
      from: opp.lost_reason ?? null,
      to: reasonToPersist ?? null,
    }
  }
  if (isRegression && trimmedReason) {
    auditDiff.regression_reason = trimmedReason
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'opportunity',
    entityId: opportunityId,
    action: 'stage_change',
    diff: auditDiff,
  })

  // SLA clock — stop the previous stage's clock and start a new one for the
  // new stage (terminal stages don't need a new clock).
  try {
    await stopSlaClock({
      tenantId: profile.tenantId,
      entityType: 'opportunity',
      entityId: opportunityId,
      label: 'opp.stage_response',
    })
    const terminal = nextStageTyped === 'won' || nextStageTyped === 'lost' ||
      nextStageTyped === 'closed_won' || nextStageTyped === 'closed_lost'
    if (!terminal) {
      await startSlaClock({
        tenantId: profile.tenantId,
        entityType: 'opportunity',
        entityId: opportunityId,
        label: 'opp.stage_response',
      })
    }
  } catch {
    // Non-fatal — stage update has already been persisted.
  }

  // Won-trigger auto-conversion (REFACTOR.md M1 US-005).
  // Creates a project if one isn't already linked, seeds the 12-item Pre-Con
  // checklist, and notifies SD-PM-PE. Best-effort: failures here don't roll
  // back the stage change — they surface as audit-log gaps the operator
  // can re-trigger from the project detail page.
  if (nextStageTyped === 'won' || nextStageTyped === 'closed_won') {
    try {
      const { convertOpportunityToProject } = await import('@/lib/operations/won-conversion')
      await convertOpportunityToProject(opportunityId, profile.user.id)
    } catch (err) {

      console.warn('[won-conversion] failed:', err instanceof Error ? err.message : err)
    }
  }

  revalidatePath('/pipeline/board')
  revalidatePath('/pipeline/coverage')
  revalidatePath('/pipeline/conversion')
  revalidatePath('/')
  if (opp.project_id) revalidatePath(`/projects/${opp.project_id}`)
  return {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCents(val: FormDataEntryValue | null): number {
  const n = parseFloat(String(val ?? '0'))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function parseDate(val: FormDataEntryValue | null): Date | undefined {
  if (typeof val !== 'string' || !val) return undefined
  const d = new Date(val)
  return isNaN(d.getTime()) ? undefined : d
}

function parseIntOpt(val: FormDataEntryValue | null): number | undefined {
  if (!val) return undefined
  const n = parseInt(String(val), 10)
  return isNaN(n) ? undefined : n
}

function parseStr(val: FormDataEntryValue | null): string | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined
  return val.trim()
}
