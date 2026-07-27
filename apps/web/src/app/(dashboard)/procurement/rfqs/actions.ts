'use server'

/**
 * RFQ Auto-Dispatch (REFACTOR.md M3 US-013).
 *
 * Procurement workflow that fans out a BOM's non-contracted-rate items to
 * suppliers for live quoting once Commercial internally approves the BOM.
 * The auto-create path is reached via the Inngest event `bom/internal_approved`
 * (see lib/inngest-rfq.ts) — that handler defers to `createRfqFromBomSystem`
 * below so it doesn't need a logged-in actor.
 */

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  boms,
  bomLineItems,
  rfqs,
  rfqQuotes,
  rateCards,
  materialItems,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'

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

// Shape of one entry inside rfqs.line_items JSONB. We tolerate older rows
// that may omit the description by keeping description optional.
interface RfqLineItemJson {
  material_item_id: string | null
  code: string | null
  description: string
  qty: number
  unit: string | null
}

// ── createRfqFromBom (system + user paths) ────────────────────────────────────

interface CreateOptions {
  /**
   * Skip capability check when called from a background job (Inngest). In that
   * case the caller passes its own tenantId so we don't need a user session.
   */
  systemTenantId?: string
}

/**
 * Reads bom_line_items, filters out lines that already have an active rate
 * card (contracted rates — no need to RFQ those), then creates a single RFQ
 * with the residual list packed into `line_items` JSONB. Returns { rfqId }.
 */
export async function createRfqFromBom(
  bomId: string,
  opts: CreateOptions = {}
): Promise<{ rfqId: string } | { error: string }> {
  // Resolve tenant + actor. System path skips the user profile.
  let tenantId: string
  let actorId: string

  if (opts.systemTenantId) {
    tenantId = opts.systemTenantId
    actorId = '00000000-0000-0000-0000-000000000000'
  } else {
    const profile = await requireUserProfile()
    if (!can(profile.role, 'rfq.dispatch')) {
      return { error: `Forbidden: role "${profile.role}" lacks "rfq.dispatch"` }
    }
    tenantId = profile.tenantId
    actorId = profile.user.id
  }

  // Verify BOM and tenant ownership.
  const [bom] = await db
    .select({ id: boms.id, project_id: boms.project_id })
    .from(boms)
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, tenantId)))
    .limit(1)

  if (!bom) return { error: 'BOM not found' }

  // Pull line items (excluding group headers).
  const lines = await db
    .select({
      id: bomLineItems.id,
      code: bomLineItems.code,
      description: bomLineItems.description,
      unit: bomLineItems.unit,
      quantity: bomLineItems.quantity,
      is_group: bomLineItems.is_group,
    })
    .from(bomLineItems)
    .where(
      and(eq(bomLineItems.bom_id, bomId), eq(bomLineItems.tenant_id, tenantId))
    )

  const itemLines = lines.filter((l) => l.is_group === 0)
  if (itemLines.length === 0) {
    return { error: 'BOM has no line items to RFQ' }
  }

  // Pull active rate cards in this tenant and index by material_item.code so
  // we can filter out lines that already have a contracted rate.
  const contracted = await db
    .select({
      code: materialItems.code,
      material_item_id: materialItems.id,
    })
    .from(rateCards)
    .innerJoin(materialItems, eq(rateCards.material_item_id, materialItems.id))
    .where(eq(rateCards.tenant_id, tenantId))

  const contractedCodes = new Set<string>()
  const materialItemIdByCode = new Map<string, string>()
  for (const c of contracted) {
    if (c.code) {
      contractedCodes.add(c.code)
      materialItemIdByCode.set(c.code, c.material_item_id)
    }
  }

  const rfqLines: RfqLineItemJson[] = itemLines
    .filter((l) => !(l.code && contractedCodes.has(l.code)))
    .map((l) => ({
      material_item_id: l.code ? materialItemIdByCode.get(l.code) ?? null : null,
      code: l.code ?? null,
      description: l.description,
      qty: l.quantity,
      unit: l.unit ?? null,
    }))

  if (rfqLines.length === 0) {
    return { error: 'All BOM lines already have contracted rates — no RFQ needed' }
  }

  const [created] = await db
    .insert(rfqs)
    .values({
      tenant_id: tenantId,
      bom_id: bomId,
      status: 'pending',
      line_items: rfqLines,
    })
    .returning({ id: rfqs.id })

  const rfqId = created!.id

  await writeAuditLog({
    tenantId,
    actorId,
    entityType: 'rfq',
    entityId: rfqId,
    action: 'create',
    diff: {
      bom_id: bomId,
      line_count: rfqLines.length,
      source: opts.systemTenantId ? 'bom_internal_approved_event' : 'manual',
    },
  })

  await notifyRoles({
    tenantId,
    recipientRoles: ['procurement'],
    subject: `New RFQ awaiting quotes (${rfqLines.length} item${
      rfqLines.length === 1 ? '' : 's'
    })`,
    body: 'A BOM has been internally approved. Source quotes from suppliers.',
    linkUrl: `/procurement/rfqs/${rfqId}`,
    alsoEmail: true,
    templateId: 'rfq-dispatch',
    templateVars: {
      project_name: bom.project_id, // page-level lookup is fine; this is just the email tag
      line_count: rfqLines.length,
      rfq_url: `/procurement/rfqs/${rfqId}`,
    },
  })

  revalidatePath('/procurement/rfqs')
  return { rfqId }
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
