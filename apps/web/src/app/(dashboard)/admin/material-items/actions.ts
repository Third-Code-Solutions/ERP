'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserProfile, can } from '@buildops/auth'
import { db } from '@buildops/database'
import { materialItems } from '@buildops/database/schema'
import { writeAuditLog } from '@/lib/audit'

const materialItemSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, 'code required').max(64),
  description: z.string().trim().min(1, 'description required'),
  category: z.string().trim().max(120).optional(),
  unit: z.string().trim().min(1, 'unit required').max(32),
  wastage_bps: z.coerce
    .number()
    .int()
    .min(0, 'wastage must be >= 0')
    .max(10000, 'wastage must be <= 10000'),
  is_active: z.coerce.boolean().optional(),
})

function readForm(formData: FormData) {
  return materialItemSchema.safeParse({
    id: formData.get('id') || undefined,
    code: formData.get('code'),
    description: formData.get('description'),
    category: formData.get('category') || undefined,
    unit: formData.get('unit'),
    wastage_bps: formData.get('wastage_bps') ?? 0,
    is_active: formData.get('is_active') === 'on' || formData.get('is_active') === 'true',
  })
}

export async function upsertMaterialItem(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.rate_card')) {
    return { error: `Forbidden: role "${profile.role}" lacks "admin.rate_card"` }
  }

  const parsed = readForm(formData)
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  try {
    if (input.id) {
      const [existing] = await db
        .select({ id: materialItems.id })
        .from(materialItems)
        .where(
          and(
            eq(materialItems.id, input.id),
            eq(materialItems.tenant_id, profile.tenantId)
          )
        )
        .limit(1)
      if (!existing) return { error: 'Material item not found' }

      await db
        .update(materialItems)
        .set({
          code: input.code,
          description: input.description,
          category: input.category,
          unit: input.unit,
          wastage_bps: input.wastage_bps,
          is_active: input.is_active ?? true,
          updated_at: new Date(),
        })
        .where(eq(materialItems.id, input.id))

      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'material_item',
        entityId: input.id,
        action: 'update',
        diff: {
          code: input.code,
          unit: input.unit,
          wastage_bps: input.wastage_bps,
          is_active: input.is_active ?? true,
        },
      })
    } else {
      const [created] = await db
        .insert(materialItems)
        .values({
          tenant_id: profile.tenantId,
          code: input.code,
          description: input.description,
          category: input.category,
          unit: input.unit,
          wastage_bps: input.wastage_bps,
          is_active: input.is_active ?? true,
        })
        .returning({ id: materialItems.id })

      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'material_item',
        entityId: created!.id,
        action: 'create',
        diff: {
          code: input.code,
          description: input.description,
          unit: input.unit,
          wastage_bps: input.wastage_bps,
        },
      })
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Database error' }
  }

  revalidatePath('/admin/material-items')
  return {}
}

export async function deactivateMaterialItem(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.rate_card')) {
    return { error: `Forbidden: role "${profile.role}" lacks "admin.rate_card"` }
  }
  const id = formData.get('id')
  if (typeof id !== 'string') return { error: 'id required' }

  await db
    .update(materialItems)
    .set({ is_active: false, updated_at: new Date() })
    .where(
      and(eq(materialItems.id, id), eq(materialItems.tenant_id, profile.tenantId))
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'material_item',
    entityId: id,
    action: 'status_change',
    diff: { is_active: false },
  })

  revalidatePath('/admin/material-items')
  return {}
}
