'use server'

/**
 * RFQ Auto-Dispatch (REFACTOR.md M3 US-013).
 *
 * Procurement workflow that fans out a BOM's non-contracted-rate items to
 * suppliers for live quoting once Commercial internally approves the BOM.
 * The auto-create path is reached via the Inngest event `bom/internal_approved`
 * (see lib/inngest-rfq.ts) — that handler uses an internal server-only
 * transaction service, never this browser-facing action.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserProfile, can } from '@third-code-erp/auth'
import {
  createRfqFromBomRecord,
  notifyRfqCreated,
  type CreatedRfq,
} from '@/lib/procurement/rfq-service'
import {
  logRfqQuoteRecord,
  notifyRfqCompleted,
  transitionRfqRecord,
} from '@/lib/procurement/rfq-workflow-service'
import {
  createRfqThroughCoreApi,
  logRfqQuoteThroughCoreApi,
  rfqCreateWritesUseCoreApi,
  rfqQuoteWritesUseCoreApi,
  rfqTerminalWritesUseCoreApi,
  transitionRfqThroughCoreApi,
} from '@/lib/erp-core-client'

// ── Schemas ───────────────────────────────────────────────────────────────────

const logQuoteSchema = z.object({
  rfq_id: z.string().uuid(),
  bom_line_item_id: z.string().uuid(),
  vendor_id: z.string().uuid(),
  submission_id: z.string().uuid(),
  unit_price_cents: z.number().int().safe().nonnegative(),
  lead_time_days: z
    .number()
    .int()
    .nonnegative()
    .max(3650)
    .optional(),
  valid_until: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(2000).optional(),
})

const cancelRfqSchema = z.object({
  rfqId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
})

// ── createRfqFromBom (authenticated compatibility action) ────────────────────

/**
 * Authenticated compatibility wrapper. Tenant, actor, role, and system mode
 * are never accepted from the caller.
 */
export async function createRfqFromBom(
  bomId: string
): Promise<{ rfqId: string } | { error: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'rfq.dispatch')) {
    return {
      error: `Forbidden: role "${profile.role}" lacks "rfq.dispatch"`,
    }
  }

  try {
    let result: CreatedRfq
    if (rfqCreateWritesUseCoreApi(profile.tenantId)) {
      const response = await createRfqThroughCoreApi({ bomId })
      if (!response.ok || !response.data) {
        return {
          error:
            response.error ?? 'RFQ creation was not committed.',
        }
      }
      result = response.data
    } else {
      const response = await createRfqFromBomRecord({
        bomId,
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        source: 'manual',
      })
      if ('error' in response) return response
      result = response
    }

    if (result.created) {
      try {
        await notifyRfqCreated(result)
      } catch {
        console.warn('[createRfqFromBom] notification dispatch failed')
      }
    }

    revalidatePath('/procurement/rfqs')
    return { rfqId: result.rfqId }
  } catch {
    console.error('[createRfqFromBom] transaction failed')
    return { error: 'RFQ could not be created. Try again.' }
  }
}

// ── logQuote ─────────────────────────────────────────────────────────────────

export async function logQuote(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'rfq.dispatch')) {
    return { error: `Forbidden: role "${profile.role}" lacks "rfq.dispatch"` }
  }

  const leadRaw = formData.get('lead_time_days')
  const priceRaw = formData.get('unit_price_cents')

  const parsed = logQuoteSchema.safeParse({
    rfq_id: formData.get('rfq_id'),
    bom_line_item_id: formData.get('bom_line_item_id'),
    vendor_id: formData.get('vendor_id'),
    submission_id: formData.get('submission_id'),
    unit_price_cents: typeof priceRaw === 'string' ? Number(priceRaw) : NaN,
    lead_time_days:
      typeof leadRaw === 'string' && leadRaw ? Number(leadRaw) : undefined,
    valid_until: (formData.get('valid_until') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return {
      error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
    }
  }
  const input = parsed.data

  try {
    if (rfqQuoteWritesUseCoreApi(profile.tenantId)) {
      const result = await logRfqQuoteThroughCoreApi(input.rfq_id, {
        submissionId: input.submission_id,
        bomLineItemId: input.bom_line_item_id,
        vendorId: input.vendor_id,
        unitPriceCents: input.unit_price_cents,
        leadTimeDays: input.lead_time_days,
        validUntil: input.valid_until,
        notes: input.notes || undefined,
      })
      if (!result.ok) return { error: result.error }

      revalidatePath(`/procurement/rfqs/${input.rfq_id}`)
      revalidatePath('/procurement/rfqs')
      return {}
    }

    const result = await logRfqQuoteRecord({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      rfqId: input.rfq_id,
      bomLineItemId: input.bom_line_item_id,
      vendorId: input.vendor_id,
      submissionId: input.submission_id,
      unitPriceCents: input.unit_price_cents,
      leadTimeDays: input.lead_time_days,
      validUntil: input.valid_until
        ? new Date(input.valid_until)
        : undefined,
      notes: input.notes || undefined,
    })
    if ('error' in result) return result

    revalidatePath(`/procurement/rfqs/${input.rfq_id}`)
    revalidatePath('/procurement/rfqs')
    return {}
  } catch {
    console.error('[logQuote] transaction failed')
    return { error: 'Quote could not be logged. Try again.' }
  }
}

// ── completeRfq ──────────────────────────────────────────────────────────────

export async function completeRfq(rfqId: string): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'rfq.dispatch')) {
    return { error: `Forbidden: role "${profile.role}" lacks "rfq.dispatch"` }
  }

  try {
    let transition: {
      rfqId: string
      tenantId: string
      transitioned: true
    }
    if (rfqTerminalWritesUseCoreApi(profile.tenantId)) {
      const result = await transitionRfqThroughCoreApi(rfqId, {
        command: 'complete',
      })
      if (!result.ok || !result.data) {
        return {
          error:
            result.error ??
            'RFQ transition was not committed.',
        }
      }
      transition = result.data
    } else {
      const result = await transitionRfqRecord({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        rfqId,
        command: 'complete',
      })
      if ('error' in result) return result
      transition = result
    }

    try {
      await notifyRfqCompleted({
        tenantId: transition.tenantId,
        rfqId: transition.rfqId,
      })
    } catch {
      console.warn('[completeRfq] notification dispatch failed')
    }

    revalidatePath(`/procurement/rfqs/${rfqId}`)
    revalidatePath('/procurement/rfqs')
    return {}
  } catch {
    console.error('[completeRfq] transaction failed')
    return { error: 'RFQ could not be completed. Try again.' }
  }
}

// ── cancelRfq ────────────────────────────────────────────────────────────────

export async function cancelRfq(
  rfqId: string,
  reason: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'rfq.dispatch')) {
    return { error: `Forbidden: role "${profile.role}" lacks "rfq.dispatch"` }
  }

  const parsed = cancelRfqSchema.safeParse({ rfqId, reason })
  if (!parsed.success) {
    if (!reason.trim()) {
      return { error: 'Cancellation reason is required' }
    }
    return {
      error: 'Cancellation reason must be 1000 characters or fewer',
    }
  }

  try {
    if (rfqTerminalWritesUseCoreApi(profile.tenantId)) {
      const result = await transitionRfqThroughCoreApi(
        parsed.data.rfqId,
        {
          command: 'cancel',
          reason: parsed.data.reason,
        }
      )
      if (!result.ok) return { error: result.error }
    } else {
      const result = await transitionRfqRecord({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        rfqId: parsed.data.rfqId,
        command: 'cancel',
        reason: parsed.data.reason,
      })
      if ('error' in result) return result
    }

    revalidatePath(`/procurement/rfqs/${rfqId}`)
    revalidatePath('/procurement/rfqs')
    return {}
  } catch {
    console.error('[cancelRfq] transaction failed')
    return { error: 'RFQ could not be cancelled. Try again.' }
  }
}
