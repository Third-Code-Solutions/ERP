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
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  rfqs,
  rfqQuotes,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'
import {
  createRfqFromBomRecord,
  notifyRfqCreated,
} from '@/lib/procurement/rfq-service'

// ── Schemas ───────────────────────────────────────────────────────────────────

const logQuoteSchema = z.object({
  rfq_id: z.string().uuid(),
  vendor_id: z.string().uuid(),
  material_item_id: z.string().uuid().optional(),
  unit_price_cents: z.number().int().nonnegative(),
  lead_time_days: z.number().int().nonnegative().optional(),
  valid_until: z.string().optional(),
  notes: z.string().optional(),
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
    vendor_id: formData.get('vendor_id'),
    material_item_id: formData.get('material_item_id') || undefined,
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

  // Tenant guard via parent RFQ.
  const [rfq] = await db
    .select({ id: rfqs.id, status: rfqs.status })
    .from(rfqs)
    .where(and(eq(rfqs.id, input.rfq_id), eq(rfqs.tenant_id, profile.tenantId)))
    .limit(1)

  if (!rfq) return { error: 'RFQ not found' }
  if (rfq.status === 'cancelled' || rfq.status === 'completed') {
    return { error: `Cannot log quotes on a ${rfq.status} RFQ` }
  }

  const [inserted] = await db
    .insert(rfqQuotes)
    .values({
      tenant_id: profile.tenantId,
      rfq_id: input.rfq_id,
      vendor_id: input.vendor_id,
      material_item_id: input.material_item_id,
      unit_price_cents: input.unit_price_cents,
      lead_time_days: input.lead_time_days,
      valid_until: input.valid_until ? new Date(input.valid_until) : undefined,
      notes: input.notes,
      created_by: profile.user.id,
    })
    .returning({ id: rfqQuotes.id })

  // Flip status to quotes_received on first quote logged.
  if (rfq.status === 'pending') {
    await db
      .update(rfqs)
      .set({ status: 'quotes_received', updated_at: new Date() })
      .where(eq(rfqs.id, input.rfq_id))
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'rfq_quote',
    entityId: inserted!.id,
    action: 'create',
    diff: {
      rfq_id: input.rfq_id,
      vendor_id: input.vendor_id,
      unit_price_cents: input.unit_price_cents,
    },
  })

  revalidatePath(`/procurement/rfqs/${input.rfq_id}`)
  revalidatePath('/procurement/rfqs')
  return {}
}

// ── completeRfq ──────────────────────────────────────────────────────────────

export async function completeRfq(rfqId: string): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'rfq.dispatch')) {
    return { error: `Forbidden: role "${profile.role}" lacks "rfq.dispatch"` }
  }

  const [rfq] = await db
    .select({ id: rfqs.id, status: rfqs.status, bom_id: rfqs.bom_id })
    .from(rfqs)
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.tenant_id, profile.tenantId)))
    .limit(1)

  if (!rfq) return { error: 'RFQ not found' }
  if (rfq.status === 'completed') return { error: 'RFQ already completed' }
  if (rfq.status === 'cancelled') return { error: 'RFQ is cancelled' }

  await db
    .update(rfqs)
    .set({ status: 'completed', updated_at: new Date() })
    .where(eq(rfqs.id, rfqId))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'rfq',
    entityId: rfqId,
    action: 'status_change',
    diff: { from: rfq.status, to: 'completed' },
  })

  // Notify Commercial — they own pricing decisions on the BOM.
  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['commercial'],
    subject: 'RFQ quotes ready for review',
    body: 'Procurement has completed sourcing. Review the comparison and update the BOM.',
    linkUrl: `/procurement/rfqs/${rfqId}`,
  })

  revalidatePath(`/procurement/rfqs/${rfqId}`)
  revalidatePath('/procurement/rfqs')
  return {}
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

  const trimmed = reason.trim()
  if (!trimmed) return { error: 'Cancellation reason is required' }

  const [rfq] = await db
    .select({ id: rfqs.id, status: rfqs.status })
    .from(rfqs)
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.tenant_id, profile.tenantId)))
    .limit(1)

  if (!rfq) return { error: 'RFQ not found' }
  if (rfq.status === 'completed') return { error: 'Cannot cancel a completed RFQ' }
  if (rfq.status === 'cancelled') return { error: 'RFQ already cancelled' }

  await db
    .update(rfqs)
    .set({ status: 'cancelled', updated_at: new Date() })
    .where(eq(rfqs.id, rfqId))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'rfq',
    entityId: rfqId,
    action: 'status_change',
    diff: { from: rfq.status, to: 'cancelled', reason: trimmed },
  })

  revalidatePath(`/procurement/rfqs/${rfqId}`)
  revalidatePath('/procurement/rfqs')
  return {}
}
