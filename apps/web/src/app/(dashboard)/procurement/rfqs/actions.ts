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
import { isoDateTimeString } from '@third-code-erp/shared-types'
import { requireUserProfile, can } from '@third-code-erp/auth'
import {
  createRfqFromBomRecord,
  notifyRfqCreated,
} from '@/lib/procurement/rfq-service'
import {
  UNIT_PRICE_FORMAT_ERROR,
  UNIT_PRICE_REQUIRED_ERROR,
} from '@/lib/procurement/rfq-quote-price'
import {
  CANCEL_REASON_MAX_LENGTH,
  CANCEL_REASON_REQUIRED_ERROR,
  CANCEL_REASON_TOO_LONG_ERROR,
} from '@/lib/procurement/rfq-terminal-command'
import {
  awardRfqQuoteRecord,
  logRfqQuoteRecord,
  notifyRfqCompleted,
  transitionRfqRecord,
} from '@/lib/procurement/rfq-workflow-service'
import {
  createRfqThroughCoreApi,
  logRfqQuoteThroughCoreApi,
  rfqCreateWritesUseCoreApi,
  rfqTerminalWritesUseCoreApi,
  rfqQuoteWritesUseCoreApi,
  transitionRfqThroughCoreApi,
} from '@/lib/erp-core-client'

// ── Schemas ───────────────────────────────────────────────────────────────────

const logQuoteSchema = z.object({
  rfq_id: z.string().guid(),
  bom_line_item_id: z.string().guid(),
  vendor_id: z.string().guid(),
  submission_id: z.string().guid(),
  // A quote is price evidence: blank or zero is refused, never logged as 0.00.
  unit_price_cents: z
    .number({ error: UNIT_PRICE_REQUIRED_ERROR })
    .int(UNIT_PRICE_FORMAT_ERROR)
    .safe(UNIT_PRICE_FORMAT_ERROR)
    .positive(UNIT_PRICE_REQUIRED_ERROR),
  lead_time_days: z
    .number()
    .int()
    .nonnegative()
    .max(3650)
    .optional(),
  valid_until: isoDateTimeString({ offset: true }).optional(),
  notes: z.string().trim().max(2000).optional(),
})

const cancelRfqSchema = z.object({
  rfqId: z.string().guid(),
  reason: z.string().trim().min(1).max(CANCEL_REASON_MAX_LENGTH),
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

  if (rfqCreateWritesUseCoreApi(profile.tenantId)) {
    const response = await createRfqThroughCoreApi({ bomId })
    if (!response.ok || !response.data) {
      return {
        error: response.error ?? 'RFQ could not be created through ERP Core.',
      }
    }
    try {
      await notifyRfqCreated(response.data)
    } catch {
      console.warn('[createRfqFromBom] notification dispatch failed')
    }
    revalidatePath('/procurement/rfqs')
    return { rfqId: response.data.rfqId }
  }

  try {
    const result = await createRfqFromBomRecord({
      bomId,
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      source: 'manual',
    })

    if ('error' in result) return result

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
    // Whole centavos only: Number() alone would accept '0x10' and '1e3'.
    unit_price_cents:
      typeof priceRaw === 'string' && /^\d+$/.test(priceRaw.trim()) ? Number(priceRaw) : NaN,
    lead_time_days:
      typeof leadRaw === 'string' && leadRaw ? Number(leadRaw) : undefined,
    valid_until: (formData.get('valid_until') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    if (first?.path[0] === 'unit_price_cents') return { error: first.message }
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

export async function awardRfqQuote(
  rfqId: string,
  quoteId: string,
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'rfq.dispatch')) {
    return { error: `Forbidden: role "${profile.role}" lacks "rfq.dispatch"` }
  }

  if (!z.string().guid().safeParse(rfqId).success || !z.string().guid().safeParse(quoteId).success) {
    return { error: 'RFQ and quote identifiers must be valid UUIDs' }
  }

  try {
    const result = await awardRfqQuoteRecord({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      rfqId,
      quoteId,
    })
    if ('error' in result) return result

    revalidatePath(`/procurement/rfqs/${rfqId}`)
    revalidatePath('/procurement/rfqs')
    revalidatePath('/projects')
    return {}
  } catch {
    console.error('[awardRfqQuote] transaction failed')
    return { error: 'RFQ quote could not be awarded. Try again.' }
  }
}

// ── completeRfq ──────────────────────────────────────────────────────────────

export async function completeRfq(rfqId: string): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'rfq.dispatch')) {
    return { error: `Forbidden: role "${profile.role}" lacks "rfq.dispatch"` }
  }

  try {
    let result
    if (rfqTerminalWritesUseCoreApi(profile.tenantId)) {
      const response = await transitionRfqThroughCoreApi(
        rfqId,
        { command: 'complete' }
      )
      if (!response.ok || !response.data) {
        return {
          error: response.error ?? 'RFQ transition failed.',
        }
      }
      result = response.data
    } else {
      result = await transitionRfqRecord({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        rfqId,
        command: 'complete',
      })
    }
    if ('error' in result) return result

    try {
      await notifyRfqCompleted({
        tenantId: result.tenantId,
        rfqId: result.rfqId,
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
      return { error: CANCEL_REASON_REQUIRED_ERROR }
    }
    return { error: CANCEL_REASON_TOO_LONG_ERROR }
  }

  try {
    let result
    if (rfqTerminalWritesUseCoreApi(profile.tenantId)) {
      const response = await transitionRfqThroughCoreApi(
        parsed.data.rfqId,
        {
          command: 'cancel',
          reason: parsed.data.reason,
        }
      )
      if (!response.ok || !response.data) {
        return {
          error: response.error ?? 'RFQ transition failed.',
        }
      }
      result = response.data
    } else {
      result = await transitionRfqRecord({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        rfqId: parsed.data.rfqId,
        command: 'cancel',
        reason: parsed.data.reason,
      })
    }
    if ('error' in result) return result

    revalidatePath(`/procurement/rfqs/${rfqId}`)
    revalidatePath('/procurement/rfqs')
    return {}
  } catch {
    console.error('[cancelRfq] transaction failed')
    return { error: 'RFQ could not be cancelled. Try again.' }
  }
}
