'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserProfile, can } from '@buildops/auth'
import { db } from '@buildops/database'
import { rateCards, materialItems, vendors } from '@buildops/database/schema'
import { writeAuditLog } from '@/lib/audit'

const rateCardSchema = z.object({
  id: z.string().uuid().optional(),
  material_item_id: z.string().uuid('material item required'),
  vendor_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  unit_price_php: z.coerce.number().nonnegative('price must be >= 0'),
  lead_time_days: z.coerce.number().int().min(0).max(3650).optional(),
  is_preferred: z.coerce.boolean().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().optional(),
})

function toCents(php: number): number {
  return Math.round(php * 100)
}

export async function upsertRateCard(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.rate_card')) {
    return { error: `Forbidden: role "${profile.role}" lacks "admin.rate_card"` }
  }

  const parsed = rateCardSchema.safeParse({
    id: formData.get('id') || undefined,
    material_item_id: formData.get('material_item_id'),
    vendor_id: formData.get('vendor_id') || undefined,
    unit_price_php: formData.get('unit_price_php') ?? 0,
    lead_time_days: formData.get('lead_time_days') || undefined,
    is_preferred: formData.get('is_preferred') === 'on' || formData.get('is_preferred') === 'true',
    effective_from: formData.get('effective_from') || undefined,
    effective_to: formData.get('effective_to') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  // Verify material item belongs to tenant.
  const [mi] = await db
    .select({ id: materialItems.id })
    .from(materialItems)
    .where(
      and(
        eq(materialItems.id, input.material_item_id),
        eq(materialItems.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!mi) return { error: 'Material item not found' }

  if (input.vendor_id) {
    const [v] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(eq(vendors.id, input.vendor_id), eq(vendors.tenant_id, profile.tenantId))
      )
      .limit(1)
    if (!v) return { error: 'Vendor not found' }
  }

  try {
    if (input.id) {
      const [existing] = await db
        .select({ id: rateCards.id })
        .from(rateCards)
        .where(
          and(eq(rateCards.id, input.id), eq(rateCards.tenant_id, profile.tenantId))
        )
        .limit(1)
      if (!existing) return { error: 'Rate card not found' }

      await db
        .update(rateCards)
        .set({
          material_item_id: input.material_item_id,
          vendor_id: input.vendor_id ?? null,
          unit_price_cents: toCents(input.unit_price_php),
          lead_time_days: input.lead_time_days ?? null,
          is_preferred: input.is_preferred ?? false,
          effective_from: input.effective_from ? new Date(input.effective_from) : new Date(),
          effective_to: input.effective_to ? new Date(input.effective_to) : null,
        })
        .where(eq(rateCards.id, input.id))

      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'rate_card',
        entityId: input.id,
        action: 'update',
        diff: {
          material_item_id: input.material_item_id,
          unit_price_cents: toCents(input.unit_price_php),
          is_preferred: input.is_preferred ?? false,
        },
      })
    } else {
      const [created] = await db
        .insert(rateCards)
        .values({
          tenant_id: profile.tenantId,
          material_item_id: input.material_item_id,
          vendor_id: input.vendor_id ?? null,
          unit_price_cents: toCents(input.unit_price_php),
          lead_time_days: input.lead_time_days ?? null,
          is_preferred: input.is_preferred ?? false,
          effective_from: input.effective_from ? new Date(input.effective_from) : new Date(),
          effective_to: input.effective_to ? new Date(input.effective_to) : null,
        })
        .returning({ id: rateCards.id })

      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'rate_card',
        entityId: created!.id,
        action: 'create',
        diff: {
          material_item_id: input.material_item_id,
          unit_price_cents: toCents(input.unit_price_php),
          vendor_id: input.vendor_id ?? null,
        },
      })
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Database error' }
  }

  revalidatePath('/admin/rate-cards')
  return {}
}

export async function deleteRateCard(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.rate_card')) {
    return { error: `Forbidden: role "${profile.role}" lacks "admin.rate_card"` }
  }
  const id = formData.get('id')
  if (typeof id !== 'string') return { error: 'id required' }

  await db
    .delete(rateCards)
    .where(and(eq(rateCards.id, id), eq(rateCards.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'rate_card',
    entityId: id,
    action: 'delete',
    diff: {},
  })

  revalidatePath('/admin/rate-cards')
  return {}
}
