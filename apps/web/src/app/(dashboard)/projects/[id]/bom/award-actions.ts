'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  awardHandoffs,
  boms,
  invoices,
  projects,
  slaClocks,
  taskInstances,
} from '@third-code-erp/database/schema'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { runSignedBomAward } from '@/lib/operations/award-automation'

export type AwardActionResult =
  | ({ ok: true } & Awaited<ReturnType<typeof runSignedBomAward>>)
  | { ok: false; error: string }

const awardFormSchema = z.object({
  projectId: z.string().uuid(),
  bomId: z.string().uuid(),
  downPaymentPercent: z.coerce
    .number()
    .finite()
    .min(0)
    .max(100)
    .refine((value) => Number.isInteger(value * 100), 'Use at most two decimal places'),
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
  if (error instanceof Error) {
    if (error.message.startsWith('Forbidden')) return 'You do not have permission to run award automation.'
    if (error.message.includes('open budget')) return error.message
    if (error.message.includes('no priced line items')) return error.message
    if (error.message.includes('reversed award handoff')) return error.message
    if (error.message.includes('locked BOM')) return error.message
    if (error.message.includes('down-payment percentage')) return error.message
  }
  return 'Award automation failed. No partial handoff was committed.'
}

export async function awardLockedBom(formData: FormData): Promise<AwardActionResult> {
  try {
    const profile = await requireUserProfile()
    if (!can(profile.role, 'project.award')) {
      return { ok: false, error: `Forbidden: role "${profile.role}" lacks "project.award"` }
    }
    const parsed = awardFormSchema.safeParse({
      projectId: formValue(formData, 'projectId'),
      bomId: formValue(formData, 'bomId'),
      downPaymentPercent: formValue(formData, 'downPaymentPercent'),
    })
    if (!parsed.success) return { ok: false, error: 'Project, locked BOM, and a valid down-payment percentage are required.' }

    const [bom] = await db
      .select({ id: boms.id, projectId: boms.project_id, status: boms.status })
      .from(boms)
      .where(
        and(
          eq(boms.tenant_id, profile.tenantId),
          eq(boms.id, parsed.data.bomId),
          eq(boms.project_id, parsed.data.projectId)
        )
      )
      .limit(1)
    if (!bom) return { ok: false, error: 'BOM not found in this project.' }
    if (bom.status !== 'locked') return { ok: false, error: 'Only a locked BOM can be awarded.' }

    const result = await db.transaction((tx) =>
      runSignedBomAward(tx, {
        tenantId: profile.tenantId,
        bomId: parsed.data.bomId,
        actorId: profile.user.id,
        downPaymentBps: Math.round(parsed.data.downPaymentPercent * 100),
      })
    )
    revalidatePath(`/projects/${parsed.data.projectId}/bom`)
    revalidatePath(`/projects/${parsed.data.projectId}`)
    revalidatePath(`/projects/${parsed.data.projectId}/cost/budget`)
    revalidatePath('/invoices')
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}

export async function reverseAwardHandoff(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const profile = await requireUserProfile()
    if (!can(profile.role, 'project.award')) {
      return { ok: false, error: `Forbidden: role "${profile.role}" lacks "project.award"` }
    }
    const parsed = reverseFormSchema.safeParse({
      projectId: formValue(formData, 'projectId'),
      handoffId: formValue(formData, 'handoffId'),
      reason: formValue(formData, 'reason'),
    })
    if (!parsed.success) return { ok: false, error: 'A reversal reason is required.' }

    await db.transaction(async (tx) => {
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
          and(
            eq(awardHandoffs.tenant_id, profile.tenantId),
            eq(awardHandoffs.id, parsed.data.handoffId),
            eq(awardHandoffs.project_id, parsed.data.projectId)
          )
        )
        .limit(1)
      if (!handoff) throw new Error('Award handoff not found')
      if (handoff.status !== 'active') throw new Error('Award handoff is already reversed')

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
      await tx
        .update(awardHandoffs)
        .set({
          status: 'reversed',
          reversed_at: reversedAt,
          reversed_by: profile.user.id,
          reversal_reason: parsed.data.reason,
        })
        .where(and(eq(awardHandoffs.tenant_id, profile.tenantId), eq(awardHandoffs.id, handoff.id)))
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'award_handoff',
        entityId: handoff.id,
        action: 'status_change',
        diff: { status: 'reversed', reason: parsed.data.reason, task_ids: taskIds },
      })
    })

    revalidatePath(`/projects/${parsed.data.projectId}/bom`)
    revalidatePath(`/projects/${parsed.data.projectId}`)
    revalidatePath('/invoices')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}
