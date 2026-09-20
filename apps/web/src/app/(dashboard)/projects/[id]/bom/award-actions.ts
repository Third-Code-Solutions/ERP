'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  awardHandoffs,
  boms,
  invoices,
  slaClocks,
  taskInstances,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { stampActorInTransaction, writeAuditLogInTransaction, type DatabaseTransaction } from '@/lib/audit'
import { runSignedBomAward } from '@/lib/operations/award-automation'

export type AwardActionResult =
  | ({ ok: true; refreshWarning?: string } & Awaited<ReturnType<typeof runSignedBomAward>>)
  | { ok: false; error: string }

const awardFormSchema = z.object({
  projectId: z.string().uuid(),
  bomId: z.string().uuid(),
  downPaymentPercent: z.string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, 'Use a non-negative percentage with at most two decimals')
    .refine((value) => {
      const [whole = '0', fraction = ''] = value.split('.')
      return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) <= 10_000n
    }, 'Down-payment percentage must be between 0% and 100%'),
})

const reverseFormSchema = z.object({
  projectId: z.string().uuid(),
  handoffId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
})

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

function safeError(error: unknown): string {
  if (error instanceof AwardWorkflowError) return error.message
  let cause: unknown = error
  const seen = new Set<unknown>()
  while (cause instanceof Object && !seen.has(cause)) {
    seen.add(cause)
    if ('code' in cause && (cause.code === '55P03' || cause.code === '40P01')) {
      return 'Award authority is changing or busy. Refresh and retry.'
    }
    cause = 'cause' in cause ? cause.cause : undefined
  }
  if (error instanceof Error) {
    if (error.message.startsWith('Forbidden')) return 'You do not have permission to run award automation.'
    if (error.message.includes('open budget')) return error.message
    if (error.message.includes('no priced line items')) return error.message
    if (error.message.includes('reversed award handoff')) return error.message
    if (error.message.includes('locked BOM')) return error.message
    if (error.message.includes('down-payment percentage')) return error.message
  }
  return 'Award outcome could not be confirmed. Refresh before retrying.'
}

class AwardWorkflowError extends Error {}

async function authorizeAward(tx: DatabaseTransaction, tenantId: string, actorId: string): Promise<void> {
  // Bound later advisory/audit waits as well as initial lifecycle locks.
  await tx.execute(sql`set local lock_timeout = '3s'`)
  const [actor] = await tx.select({ role: users.role }).from(users)
    .where(and(eq(users.id, actorId), eq(users.tenant_id, tenantId), eq(users.account_status, 'active')))
    .limit(1).for('share', { noWait: true })
  const role = z.enum(ERP_ROLES).safeParse(actor?.role)
  if (!actor || !role.success || !can(role.data, 'project.award')) {
    throw new AwardWorkflowError('You no longer have permission to run award automation. Refresh your session.')
  }
  const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.status, 'active')))
    .limit(1).for('share', { noWait: true })
  if (!tenant) throw new AwardWorkflowError('This organization is not active. Award automation is unavailable.')
  await stampActorInTransaction(tx, actorId)
}

function refreshAwardViews(projectId: string, budget = false): string | undefined {
  try {
    revalidatePath(`/projects/${projectId}/bom`)
    revalidatePath(`/projects/${projectId}`)
    if (budget) revalidatePath(`/projects/${projectId}/cost/budget`)
    revalidatePath('/invoices')
  } catch {
    return 'The handoff change was committed, but the view could not refresh. Reload to see the recorded result.'
  }
}

function parseDownPaymentBps(value: string): number {
  const [whole = '0', fraction = ''] = value.split('.')
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (bps > 10_000n) throw new Error('Down-payment percentage must be between 0% and 100%')
  return Number(bps)
}

export async function awardLockedBom(formData: FormData): Promise<AwardActionResult> {
  const traceId = randomUUID()
  let actorId: string | null = null
  let tenantId: string | null = null
  let outcome = 'rejected'
  try {
    const profile = await requireUserProfile()
    actorId = profile.user.id
    tenantId = profile.tenantId
    if (!can(profile.role, 'project.award')) {
      return { ok: false, error: `Forbidden: role "${profile.role}" lacks "project.award"` }
    }
    const parsed = awardFormSchema.safeParse({
      projectId: formValue(formData, 'projectId'),
      bomId: formValue(formData, 'bomId'),
      downPaymentPercent: formValue(formData, 'downPaymentPercent'),
    })
    if (!parsed.success) return { ok: false, error: 'Project, locked BOM, and a valid down-payment percentage are required.' }

    outcome = 'unconfirmed'
    const result = await db.transaction(async (tx) => {
      await authorizeAward(tx, profile.tenantId, profile.user.id)
      const [bom] = await tx
        .select({ id: boms.id, projectId: boms.project_id, status: boms.status })
        .from(boms)
        .where(
          and(
            eq(boms.tenant_id, profile.tenantId),
            eq(boms.id, parsed.data.bomId),
            eq(boms.project_id, parsed.data.projectId)
          )
        )
        .limit(1).for('share', { noWait: true })
      if (!bom) throw new AwardWorkflowError('BOM not found in this project.')
      if (bom.status !== 'locked') throw new AwardWorkflowError('Only a locked BOM can be awarded.')
      // The shared helper owns project-code lock ordering; do not pre-lock project.
      return runSignedBomAward(tx, {
        tenantId: profile.tenantId,
        bomId: parsed.data.bomId,
        actorId: profile.user.id,
        downPaymentBps: parseDownPaymentBps(parsed.data.downPaymentPercent),
      })
    })
    const refreshWarning = refreshAwardViews(parsed.data.projectId, true)
    outcome = refreshWarning ? 'succeeded_refresh_pending' : 'succeeded'
    return { ok: true, ...result, ...(refreshWarning ? { refreshWarning } : {}) }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  } finally {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: tenantId, actor_id: actorId, action: 'project.award', outcome }))
  }
}

export async function reverseAwardHandoff(formData: FormData): Promise<{ ok: true; refreshWarning?: string } | { ok: false; error: string }> {
  const traceId = randomUUID()
  let actorId: string | null = null
  let tenantId: string | null = null
  let outcome = 'rejected'
  try {
    const profile = await requireUserProfile()
    actorId = profile.user.id
    tenantId = profile.tenantId
    if (!can(profile.role, 'project.award')) {
      return { ok: false, error: `Forbidden: role "${profile.role}" lacks "project.award"` }
    }
    const parsed = reverseFormSchema.safeParse({
      projectId: formValue(formData, 'projectId'),
      handoffId: formValue(formData, 'handoffId'),
      reason: formValue(formData, 'reason'),
    })
    if (!parsed.success) return { ok: false, error: 'A reversal reason is required.' }

    outcome = 'unconfirmed'
    await db.transaction(async (tx) => {
      await authorizeAward(tx, profile.tenantId, profile.user.id)
      const scope = and(eq(awardHandoffs.tenant_id, profile.tenantId),
        eq(awardHandoffs.id, parsed.data.handoffId), eq(awardHandoffs.project_id, parsed.data.projectId))
      const [identity] = await tx.select({ sourceBomId: awardHandoffs.source_bom_id }).from(awardHandoffs).where(scope).limit(1)
      if (!identity) throw new AwardWorkflowError('Award handoff not found in this project.')
      // Match award creation's advisory identity before locking the durable receipt.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'award-handoff:' + profile.tenantId + ':' + identity.sourceBomId}, 0))`)
      const [handoff] = await tx
        .select({
          id: awardHandoffs.id,
          projectId: awardHandoffs.project_id,
          status: awardHandoffs.status,
          dpInvoiceId: awardHandoffs.dp_invoice_id,
          taskIds: awardHandoffs.task_ids,
        })
        .from(awardHandoffs)
        .where(
          and(scope, eq(awardHandoffs.source_bom_id, identity.sourceBomId))
        )
        .limit(1).for('update')
      if (!handoff) throw new AwardWorkflowError('Award handoff changed. Refresh before retrying.')
      if (handoff.status !== 'active') throw new AwardWorkflowError('Award handoff is already reversed. Its recorded reason and actor were preserved.')

      const taskIds = Object.values(handoff.taskIds)
      if (taskIds.length > 0) {
        await tx
          .update(slaClocks)
          .set({ status: 'cancelled', updated_by: profile.user.id, updated_at: new Date() })
          .where(
            and(
              eq(slaClocks.tenant_id, profile.tenantId),
              inArray(slaClocks.task_instance_id, taskIds)
            )
          )
        await tx
          .update(taskInstances)
          .set({ status: 'cancelled', updated_by: profile.user.id, updated_at: new Date() })
          .where(
            and(
              eq(taskInstances.tenant_id, profile.tenantId),
              inArray(taskInstances.id, taskIds)
            )
          )
      }

      await tx
        .update(invoices)
        .set({ status: 'cancelled', updated_at: new Date() })
        .where(
          and(
            eq(invoices.tenant_id, profile.tenantId),
            eq(invoices.id, handoff.dpInvoiceId),
            eq(invoices.status, 'draft')
          )
        )
      const reversedAt = new Date()
      const [reversed] = await tx
        .update(awardHandoffs)
        .set({
          status: 'reversed',
          reversed_at: reversedAt,
          reversed_by: profile.user.id,
          reversal_reason: parsed.data.reason,
        })
        .where(and(scope, eq(awardHandoffs.status, 'active')))
        .returning({ id: awardHandoffs.id })
      if (!reversed) throw new AwardWorkflowError('Award handoff changed. Refresh before retrying.')
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'award_handoff',
        entityId: handoff.id,
        action: 'status_change',
        diff: { status: 'reversed', reason: parsed.data.reason, task_ids: taskIds },
      })
    })

    const refreshWarning = refreshAwardViews(parsed.data.projectId)
    outcome = refreshWarning ? 'succeeded_refresh_pending' : 'succeeded'
    return { ok: true, ...(refreshWarning ? { refreshWarning } : {}) }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  } finally {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: tenantId, actor_id: actorId, action: 'project.award_reversal', outcome }))
  }
}
