'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { mappingConfig, materialItems } from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'

const mappingSchema = z.object({
  id: z.string().uuid().optional(),
  source_label: z.string().trim().min(1, 'source label required').max(255),
  material_item_id: z.string().uuid('material item required'),
  notes: z.string().trim().max(500).optional(),
})

export async function upsertMappingConfig(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.system_config')) {
    return { error: `Forbidden: role "${profile.role}" lacks "admin.system_config"` }
  }

  const parsed = mappingSchema.safeParse({
    id: formData.get('id') || undefined,
    source_label: formData.get('source_label'),
    material_item_id: formData.get('material_item_id'),
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

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

  try {
    if (input.id) {
      const [existing] = await db
        .select({ id: mappingConfig.id })
        .from(mappingConfig)
        .where(
          and(
            eq(mappingConfig.id, input.id),
            eq(mappingConfig.tenant_id, profile.tenantId)
          )
        )
        .limit(1)
      if (!existing) return { error: 'Mapping not found' }

      await db
        .update(mappingConfig)
        .set({
          source_label: input.source_label,
          material_item_id: input.material_item_id,
          notes: input.notes ?? null,
        })
        .where(eq(mappingConfig.id, input.id))

      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'mapping_config',
        entityId: input.id,
        action: 'update',
        diff: {
          source_label: input.source_label,
          material_item_id: input.material_item_id,
        },
      })
    } else {
      const [created] = await db
        .insert(mappingConfig)
        .values({
          tenant_id: profile.tenantId,
          source_label: input.source_label,
          material_item_id: input.material_item_id,
          notes: input.notes,
        })
        .returning({ id: mappingConfig.id })

      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'mapping_config',
        entityId: created!.id,
        action: 'create',
        diff: {
          source_label: input.source_label,
          material_item_id: input.material_item_id,
        },
      })
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Database error' }
  }

  revalidatePath('/admin/mapping-config')
  return {}
}

export async function deleteMappingConfig(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.system_config')) {
    return { error: `Forbidden: role "${profile.role}" lacks "admin.system_config"` }
  }
  const id = formData.get('id')
  if (typeof id !== 'string') return { error: 'id required' }

  await db
    .delete(mappingConfig)
    .where(and(eq(mappingConfig.id, id), eq(mappingConfig.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'mapping_config',
    entityId: id,
    action: 'delete',
    diff: {},
  })

  revalidatePath('/admin/mapping-config')
  return {}
}
