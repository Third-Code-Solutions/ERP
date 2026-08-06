'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserProfile, requireCapability } from '@third-code-erp/auth'
import {
  createCostEntryThroughCoreApi,
  deleteCostEntryThroughCoreApi,
} from '@/lib/erp-core-client'

const createSchema = z.object({
  project_id: z.string().uuid(),
  cost_code_id: z.string().uuid(),
  cost_category: z.enum(['material', 'labour', 'subcontractor', 'equipment', 'overhead', 'other']),
  description: z.string().min(1).max(500),
  amount_php: z.coerce.number().min(0.01).max(1_000_000_000),
  quantity: z.coerce.number().int().min(1).max(1_000_000).default(1),
  unit: z.string().max(20).optional(),
  incurred_at: z.string().optional(),
  reference_number: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  idempotency_key: z.string().trim().min(1).max(256).optional(),
})

type Result = { id: string } | { error: string }

function safeMessage(err: unknown): string {
  if (err instanceof Error) {
    // Don't leak the raw capability string to the UI.
    if (err.message.startsWith('Forbidden')) return 'You do not have permission to record costs.'
    return err.message
  }
  return 'Could not record the cost entry.'
}

export async function createCostEntry(formData: FormData): Promise<Result> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'cost.record')

    const parsed = createSchema.safeParse({
      project_id: formData.get('project_id'),
      cost_code_id: formData.get('cost_code_id'),
      cost_category: formData.get('cost_category'),
      description: formData.get('description'),
      amount_php: formData.get('amount_php'),
      quantity: formData.get('quantity') ?? 1,
      unit: formData.get('unit') || undefined,
      incurred_at: formData.get('incurred_at') || undefined,
      reference_number: formData.get('reference_number') || undefined,
      notes: formData.get('notes') || undefined,
      idempotency_key: formData.get('idempotency_key') || undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
    }
    const d = parsed.data
    const amountCents = Math.round(d.amount_php * 100)

    const result = await createCostEntryThroughCoreApi(
      d.project_id,
      {
        costCodeId: d.cost_code_id,
        costCategory: d.cost_category,
        description: d.description,
        amountCents,
        quantity: d.quantity,
        unit: d.unit ?? null,
        incurredAt: d.incurred_at
          ? new Date(`${d.incurred_at}T00:00:00.000Z`).toISOString()
          : null,
        referenceNumber: d.reference_number ?? null,
        notes: d.notes ?? null,
      },
      d.idempotency_key ?? randomUUID()
    )
    if (!result.ok || !result.data) {
      return { error: result.error ?? 'Could not record the cost entry.' }
    }
    if (
      result.data.tenantId !== profile.tenantId ||
      result.data.projectId !== d.project_id
    ) {
      return { error: 'Cost entry creation returned an invalid tenant scope.' }
    }
    revalidatePath(`/projects/${d.project_id}/cost`)
    revalidatePath(`/projects/${d.project_id}`)
    revalidatePath('/reports')
    return { id: result.data.id }
  } catch (err) {
    return { error: safeMessage(err) }
  }
}

export async function deleteCostEntry(
  entryId: string,
  projectId: string,
  reason: string = 'Manual cost correction',
  idempotencyKey: string = randomUUID()
): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'cost.record')

    const parsedReason = z.string().trim().min(1).max(500).safeParse(reason)
    if (!parsedReason.success) {
      return { error: parsedReason.error.issues[0]?.message ?? 'Invalid deletion reason.' }
    }
    const parsedIdempotencyKey = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
    if (!parsedIdempotencyKey.success) {
      return { error: 'Invalid idempotency key.' }
    }

    const result = await deleteCostEntryThroughCoreApi(
      projectId,
      entryId,
      parsedReason.data,
      parsedIdempotencyKey.data
    )
    if (!result.ok || !result.data) {
      return { error: result.error ?? 'Could not void the cost entry.' }
    }
    if (
      result.data.tenantId !== profile.tenantId ||
      result.data.projectId !== projectId ||
      result.data.costEntryId !== entryId ||
      result.data.status !== 'voided' ||
      result.data.costSource !== 'manual'
    ) {
      return { error: 'Cost entry deletion returned an invalid tenant scope.' }
    }

    revalidatePath(`/projects/${projectId}/cost`)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/reports')
    return { ok: true }
  } catch (err) {
    return { error: safeMessage(err) }
  }
}
