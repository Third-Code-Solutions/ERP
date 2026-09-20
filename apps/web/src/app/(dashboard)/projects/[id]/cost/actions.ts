'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserProfile, requireCapability } from '@third-code-erp/auth'
import {
  createCostEntryThroughCoreApi,
  deleteCostEntryThroughCoreApi,
} from '@/lib/erp-core-client'

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase())
const scopeSchema = z.object({ actorId: uuidSchema, tenantId: uuidSchema })

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const createSchema = z.object({
  project_id: uuidSchema,
  cost_code_id: uuidSchema,
  cost_category: z.enum(['material', 'labour', 'subcontractor', 'equipment', 'overhead', 'other']),
  description: z.string().trim().min(1).max(500),
  amount_php: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Enter pesos with at most two decimal places.')
    .transform((value) => {
      const [pesos, cents = ''] = value.split('.')
      return Number(pesos) * 100 + Number(cents.padEnd(2, '0'))
    }).pipe(z.number().int().min(1).max(100_000_000_000)),
  quantity: z.coerce.number().int().min(1).max(1_000_000).default(1),
  unit: z.string().trim().max(20).optional(),
  incurred_at: z.string().refine(validCalendarDate, 'Enter a valid calendar date.').optional(),
  reference_number: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  idempotency_key: z.string().trim().min(1).max(256).optional(),
})

type Receipt = { tenantId: string; actorId: string; projectId: string; requestId: string; costEntryId: string }
type Failure = { error: string; outcomeUnknown?: boolean }
type Result = { id: string; receipt: Receipt; refreshWarning?: string } | Failure

function refreshCost(projectId: string): { refreshWarning?: string } {
  try {
    revalidatePath(`/projects/${projectId}/cost`)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/reports')
    return {}
  } catch {
    return { refreshWarning: 'The cost command committed, but the view could not refresh. Reload to see the recorded result.' }
  }
}

function safeMessage(err: unknown): string {
  if (err instanceof Error) {
    // Don't leak the raw capability string to the UI.
    if (err.message.startsWith('Forbidden')) return 'You do not have permission to record costs.'
  }
  return 'Could not record the cost entry.'
}

export async function createCostEntry(formData: FormData): Promise<Result> {
  const traceId = randomUUID()
  let tenantId: string | null = null
  let actorId: string | null = null
  let dispatched = false
  let outcome = 'rejected'
  try {
    const profile = await requireUserProfile()
    tenantId = profile.tenantId.toLowerCase()
    actorId = profile.user.id.toLowerCase()
    requireCapability(profile, 'cost.record')
    if (formData.has('expected_actor_id') || formData.has('expected_tenant_id')) {
      const scope = scopeSchema.safeParse({ actorId: formData.get('expected_actor_id'), tenantId: formData.get('expected_tenant_id') })
      if (!scope.success || scope.data.actorId !== actorId || scope.data.tenantId !== tenantId) {
        return { error: 'Your account context changed. Reload before recording costs.' }
      }
    }

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
    const amountCents = d.amount_php
    const requestId = d.idempotency_key ?? randomUUID()
    const incurredAt = d.incurred_at ? `${d.incurred_at}T00:00:00.000Z` : null

    dispatched = true
    const result = await createCostEntryThroughCoreApi(
      d.project_id,
      {
        costCodeId: d.cost_code_id,
        costCategory: d.cost_category,
        description: d.description,
        amountCents,
        quantity: d.quantity,
        unit: d.unit ?? null,
        incurredAt,
        referenceNumber: d.reference_number ?? null,
        notes: d.notes ?? null,
      },
      requestId
    )
    if (!result.ok || !result.data) {
      outcome = result.outcomeUnknown ? 'unconfirmed' : 'rejected'
      return { error: result.error ?? 'Could not record the cost entry.', ...(result.outcomeUnknown ? { outcomeUnknown: true } : {}) }
    }
    if (
      result.data.tenantId.toLowerCase() !== tenantId ||
      result.data.projectId.toLowerCase() !== d.project_id
    ) {
      outcome = 'unconfirmed'
      return { error: 'Cost entry creation returned an invalid tenant scope.', outcomeUnknown: true }
    }
    const receipt = result.data
    if (!uuidSchema.safeParse(receipt.id).success || receipt.costSource !== 'manual' ||
      receipt.costCodeId.toLowerCase() !== d.cost_code_id || receipt.costCategory !== d.cost_category ||
      receipt.amountCents !== amountCents || receipt.quantity !== d.quantity ||
      receipt.description !== d.description || receipt.unit !== (d.unit ?? null) ||
      receipt.referenceNumber !== (d.reference_number ?? null) || receipt.notes !== (d.notes ?? null) ||
      (incurredAt !== null && new Date(receipt.incurredAt).getTime() !== new Date(incurredAt).getTime())) {
      outcome = 'unconfirmed'
      return { error: 'Cost creation receipt does not match the submitted command. Retry the unchanged command.', outcomeUnknown: true }
    }
    const refresh = refreshCost(d.project_id)
    outcome = refresh.refreshWarning ? 'succeeded_refresh_pending' : 'succeeded'
    const costEntryId = receipt.id.toLowerCase()
    return { id: costEntryId, receipt: { tenantId, actorId, projectId: d.project_id, requestId, costEntryId }, ...refresh }
  } catch (err) {
    outcome = dispatched ? 'unconfirmed' : 'rejected'
    return dispatched
      ? { error: 'Cost creation outcome is unconfirmed. Retry the unchanged command to recover its receipt.', outcomeUnknown: true }
      : { error: safeMessage(err) }
  } finally {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: tenantId, actor_id: actorId, action: 'cost_entry.create', outcome }))
  }
}

export async function deleteCostEntry(
  rawEntryId: string,
  rawProjectId: string,
  reason: string = 'Manual cost correction',
  idempotencyKey: string = randomUUID(),
  expectedScope?: { actorId: string; tenantId: string }
): Promise<{ ok: true; receipt: Receipt; refreshWarning?: string } | Failure> {
  const traceId = randomUUID()
  let tenantId: string | null = null
  let actorId: string | null = null
  let dispatched = false
  let outcome = 'rejected'
  try {
    const profile = await requireUserProfile()
    tenantId = profile.tenantId.toLowerCase()
    actorId = profile.user.id.toLowerCase()
    requireCapability(profile, 'cost.record')
    if (expectedScope !== undefined) {
      const scope = scopeSchema.safeParse(expectedScope)
      if (!scope.success || scope.data.actorId !== actorId || scope.data.tenantId !== tenantId) {
        return { error: 'Your account context changed. Reload before changing costs.' }
      }
    }
    const ids = z.object({ entryId: uuidSchema, projectId: uuidSchema }).safeParse({ entryId: rawEntryId, projectId: rawProjectId })
    if (!ids.success) {
      return { error: 'Invalid project or cost entry.' }
    }
    const { entryId, projectId } = ids.data

    const parsedReason = z.string().trim().min(1).max(500).safeParse(reason)
    if (!parsedReason.success) {
      return { error: parsedReason.error.issues[0]?.message ?? 'Invalid deletion reason.' }
    }
    const parsedIdempotencyKey = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
    if (!parsedIdempotencyKey.success) {
      return { error: 'Invalid idempotency key.' }
    }

    dispatched = true
    const result = await deleteCostEntryThroughCoreApi(
      projectId,
      entryId,
      parsedReason.data,
      parsedIdempotencyKey.data
    )
    if (!result.ok || !result.data) {
      outcome = result.outcomeUnknown ? 'unconfirmed' : 'rejected'
      return { error: result.error ?? 'Could not void the cost entry.', ...(result.outcomeUnknown ? { outcomeUnknown: true } : {}) }
    }
    if (
      result.data.tenantId.toLowerCase() !== tenantId ||
      result.data.projectId.toLowerCase() !== projectId ||
      result.data.costEntryId.toLowerCase() !== entryId ||
      result.data.status !== 'voided' ||
      result.data.costSource !== 'manual'
    ) {
      outcome = 'unconfirmed'
      return { error: 'Cost entry deletion returned an invalid tenant scope.', outcomeUnknown: true }
    }

    const refresh = refreshCost(projectId)
    outcome = refresh.refreshWarning ? 'succeeded_refresh_pending' : 'succeeded'
    return { ok: true, receipt: { tenantId, actorId, projectId, requestId: parsedIdempotencyKey.data, costEntryId: entryId }, ...refresh }
  } catch (err) {
    outcome = dispatched ? 'unconfirmed' : 'rejected'
    return dispatched
      ? { error: 'Cost void outcome is unconfirmed. Retry the unchanged command to recover its receipt.', outcomeUnknown: true }
      : { error: safeMessage(err) }
  } finally {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: tenantId, actor_id: actorId, action: 'cost_entry.void', outcome }))
  }
}
