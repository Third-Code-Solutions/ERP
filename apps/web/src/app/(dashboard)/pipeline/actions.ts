'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { can, getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { accounts, opportunities, projects } from '@third-code-erp/database/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import {
  opportunityStageWritesUseCoreApi,
  transitionOpportunityStageThroughCoreApi,
} from '@/lib/erp-core-client'
import { startSlaClock } from '@/lib/operations/sla-clock'
import {
  PIPELINE_STAGES,
  STAGE_PROBABILITY,
  STAGE_TRANSITIONS,
  type PipelineStage,
  type OpportunityStage,
} from '@third-code-erp/shared-types'

const CORE_WON_STAGES: ReadonlySet<OpportunityStage> = new Set<OpportunityStage>([
  'won',
  'closed_won',
])

// ── Create opportunity ────────────────────────────────────────────────────────

export async function createOpportunity(formData: FormData): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'opportunity.create')) {
    return { error: `Forbidden: role "${profile.role}" cannot create opportunities` }
  }

  const projectId = formData.get('project_id')
  if (typeof projectId !== 'string' || !projectId) return { error: 'Project is required' }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.tenant_id, profile.tenantId),
        isNull(projects.deleted_at)
      )
    )

  if (!project) return { error: 'Project not found' }

  const tcvCents = parseCents(formData.get('tcv'))
  const gpCents = parseCents(formData.get('gp'))
  const probability = parseProb(formData.get('probability')) ?? STAGE_PROBABILITY.opportunity_creation
  const weightedTcvCents = Math.round(tcvCents * probability / 100)

  const [opp] = await db
    .insert(opportunities)
    .values({
      tenant_id: profile.tenantId,
      project_id: projectId,
      rep_id: profile.user.id,
      stage: 'opportunity_creation',
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

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'opportunity',
    entityId: opp!.id,
    action: 'create',
    diff: { stage: 'opportunity_creation', tcv_cents: tcvCents, project_id: projectId },
  })

  revalidatePath('/pipeline/coverage')
  revalidatePath('/pipeline/list')
  revalidatePath('/')
  return {}
}

// ── Create opportunity for an account (ABI OPS flow) ──────────────────────────

/**
 * Create an Opportunity owned by an Account (REFACTOR.md M1 US-002).
 *
 * Requires `account_id`; `project_id` is optional and only persisted when the
 * caller wants to pre-link an existing project. The opp is created at the
 * canonical `lead` stage. Accounts whose KYC has not yet been approved can
 * still produce a Lead — the KYC gate only kicks in when advancing past
 * `site_survey`.
 */
export async function createOpportunityForAccount(formData: FormData): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'opportunity.create')) {
    return { error: `Forbidden: role "${profile.role}" cannot create opportunities` }
  }

  const accountId = formData.get('account_id')
  if (typeof accountId !== 'string' || !accountId) return { error: 'Account is required' }

  const [account] = await db
    .select({ id: accounts.id, kyc_status: accounts.kyc_status, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.tenant_id, profile.tenantId)))

  if (!account) return { error: 'Account not found' }

  const stageRaw = parseStr(formData.get('stage')) ?? 'lead'
  if (!PIPELINE_STAGES.includes(stageRaw as PipelineStage)) {
    return { error: `Invalid stage: ${stageRaw}` }
  }
  const stage = stageRaw as PipelineStage

  // KYC gate: only `lead` is permitted unless KYC is approved or not_required.
  const kycOk = account.kyc_status === 'approved' || account.kyc_status === 'not_required'
  if (stage !== 'lead' && !kycOk) {
    return { error: 'Account KYC must be Approved before this stage' }
  }

  const projectIdRaw = formData.get('project_id')
  let projectId: string | undefined
  if (typeof projectIdRaw === 'string' && projectIdRaw) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectIdRaw),
          eq(projects.tenant_id, profile.tenantId),
          isNull(projects.deleted_at)
        )
      )
    if (!project) return { error: 'Project not found' }
    projectId = project.id
  }

  const tcvCents = parseCents(formData.get('tcv'))
  const gpCents = parseCents(formData.get('gp'))
  const probability = STAGE_PROBABILITY[stage] ?? 10
  const weightedTcvCents = Math.round((tcvCents * probability) / 100)

  const [opp] = await db
    .insert(opportunities)
    .values({
      tenant_id: profile.tenantId,
      account_id: accountId,
      project_id: projectId,
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
    diff: { stage, account_id: accountId, project_id: projectId ?? null, tcv_cents: tcvCents },
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

  revalidatePath('/pipeline')
  revalidatePath('/pipeline/coverage')
  revalidatePath('/pipeline/list')
  revalidatePath('/')
  return {}
}

// ── Advance stage ─────────────────────────────────────────────────────────────

/**
 * Advance an opportunity to the next stage.
 *
 * Signature:
 *   advanceOpportunityStage(opportunityId: string, nextStage: string, reason?: string)
 *
 * `reason` is forwarded to the Core transaction. Core requires it for Lost and
 * regression transitions and records it with the atomic audit evidence.
 *
 * Examples:
 *   await advanceOpportunityStage(id, 'negotiation')
 *   await advanceOpportunityStage(id, 'closed_lost', 'Lost to incumbent on price')
 */
export async function advanceOpportunityStage(
  opportunityId: string,
  nextStage: string,
  reason?: string
): Promise<{ error?: string; projectId?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'opportunity.advance_stage')) {
    return { error: `Forbidden: role "${profile.role}" cannot advance opportunities` }
  }

  const nextStageTyped = nextStage as OpportunityStage
  const trimmedReason =
    typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : undefined

  let coreSelected: boolean
  try {
    coreSelected = opportunityStageWritesUseCoreApi(profile.tenantId)
  } catch {
    return {
      error:
        'Opportunity stage transition could not be selected. No Opportunity stage transition was committed.',
    }
  }
  if (!coreSelected) {
    return {
      error: 'Opportunity stage transition is not enabled for this tenant.',
    }
  }

  let transition: Awaited<
    ReturnType<typeof transitionOpportunityStageThroughCoreApi>
  >
  try {
    transition = await transitionOpportunityStageThroughCoreApi(
      opportunityId,
      {
        newStage: nextStageTyped,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      },
      stageTransitionIdempotencyKey(
        opportunityId,
        nextStageTyped,
        trimmedReason
      )
    )
  } catch {
    return {
      error:
        'ERP Core API is unavailable. No Opportunity stage transition was committed.',
    }
  }
  if (!transition.ok) {
    return {
      error:
        transition.error ??
        'Opportunity stage transition was not completed.',
    }
  }

  const { data } = transition
  const isWonTransition = CORE_WON_STAGES.has(nextStageTyped)
  if (!data) {
    return {
      error: isWonTransition
        ? 'ERP Core API returned an invalid Won-to-Project transition result.'
        : 'ERP Core API returned an invalid Opportunity stage transition result.',
    }
  }
  const coreIdentityIsValid =
    data.opportunityId === opportunityId &&
    data.tenantId === profile.tenantId &&
    data.toStage === nextStageTyped

  if (isWonTransition) {
    if (
      !coreIdentityIsValid ||
      !data.convertedToProject ||
      !data.projectId ||
      !data.checklistId
    ) {
      return {
        error: 'ERP Core API returned an invalid Won-to-Project transition result.',
      }
    }

    revalidatePipelinePaths()
    revalidatePath(`/projects/${data.projectId}`)
    return { projectId: data.projectId }
  }

  const validTransitionEdge = STAGE_TRANSITIONS[data.fromStage].includes(
    nextStageTyped
  )
  if (
    !coreIdentityIsValid ||
    !validTransitionEdge ||
    data.convertedToProject ||
    data.projectId !== null ||
    data.checklistId !== null
  ) {
    return {
      error:
        'ERP Core API returned an invalid Opportunity stage transition result.',
    }
  }

  revalidatePipelinePaths()
  return {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stageTransitionIdempotencyKey(
  opportunityId: string,
  nextStage: OpportunityStage,
  reason?: string
): string {
  const commandDigest = createHash('sha256')
    .update(
      JSON.stringify({
        opportunityId,
        nextStage,
        reason: reason ?? null,
      }),
      'utf8'
    )
    .digest('hex')

  // Exact retries share a key, while a different lifecycle command cannot
  // collide with a completed command in Core's tenant-scoped ledger.
  const prefix = CORE_WON_STAGES.has(nextStage)
    ? 'pipeline-won'
    : 'pipeline-stage'
  return `${prefix}-${commandDigest}`
}

function revalidatePipelinePaths(): void {
  revalidatePath('/pipeline')
  revalidatePath('/pipeline/coverage')
  revalidatePath('/pipeline/list')
  revalidatePath('/')
}

function parseCents(val: FormDataEntryValue | null): number {
  const n = parseFloat(String(val ?? '0'))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function parseProb(val: FormDataEntryValue | null): number | null {
  const n = parseInt(String(val ?? ''), 10)
  if (isNaN(n)) return null
  return Math.min(100, Math.max(0, n))
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
