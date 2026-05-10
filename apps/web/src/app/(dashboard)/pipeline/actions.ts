'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { opportunities, projects, users } from '@buildops/database/schema'
import { and, eq } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import { STAGE_PROBABILITY, STAGE_TRANSITIONS, type OpportunityStage } from '@buildops/shared-types'

// ── Create opportunity ────────────────────────────────────────────────────────

export async function createOpportunity(formData: FormData): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const projectId = formData.get('project_id')
  if (typeof projectId !== 'string' || !projectId) return { error: 'Project is required' }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, userRow.tenant_id)))

  if (!project) return { error: 'Project not found' }

  const tcvCents = parseCents(formData.get('tcv'))
  const gpCents = parseCents(formData.get('gp'))
  const probability = parseProb(formData.get('probability')) ?? STAGE_PROBABILITY.opportunity_creation
  const weightedTcvCents = Math.round(tcvCents * probability / 100)

  const [opp] = await db
    .insert(opportunities)
    .values({
      tenant_id: userRow.tenant_id,
      project_id: projectId,
      rep_id: user.id,
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
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'opportunity',
    entityId: opp!.id,
    action: 'create',
    diff: { stage: 'opportunity_creation', tcv_cents: tcvCents, project_id: projectId },
  })

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
  lostReason?: string
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const [opp] = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      tcv_cents: opportunities.tcv_cents,
      project_id: opportunities.project_id,
      lost_reason: opportunities.lost_reason,
    })
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, userRow.tenant_id)))

  if (!opp) return { error: 'Opportunity not found' }

  const allowed = STAGE_TRANSITIONS[opp.stage as OpportunityStage] ?? []
  if (!allowed.includes(nextStage as OpportunityStage)) {
    return { error: `Cannot move from ${opp.stage} to ${nextStage}` }
  }

  const newProbability = STAGE_PROBABILITY[nextStage as OpportunityStage] ?? 0
  const newWeightedTcv = Math.round(opp.tcv_cents * newProbability / 100)

  // Only capture lost_reason on transitions into closed_lost. Trim and treat
  // empty strings as undefined so we don't overwrite an existing reason with
  // whitespace, and don't leak unrelated text on non-loss transitions.
  const isClosingLost = nextStage === 'closed_lost'
  const trimmedReason =
    typeof lostReason === 'string' && lostReason.trim().length > 0
      ? lostReason.trim()
      : undefined
  const reasonToPersist = isClosingLost ? trimmedReason ?? null : undefined

  const updateValues: {
    stage: OpportunityStage
    probability: number
    weighted_tcv_cents: number
    updated_at: Date
    lost_reason?: string | null
  } = {
    stage: nextStage as OpportunityStage,
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
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, userRow.tenant_id)))

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

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'opportunity',
    entityId: opportunityId,
    action: 'stage_change',
    diff: auditDiff,
  })

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
