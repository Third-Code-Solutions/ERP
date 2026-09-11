'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { tenants } from '@third-code-erp/database/schema'
import { eq } from 'drizzle-orm'
import { writeAuditLogInTransaction } from '@/lib/audit'

const optionalField = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null)
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(255),
  bir_tin: optionalField(20),
  pcab_license: optionalField(50),
  dpo_contact: optionalField(255),
})

export async function updateTenantSettings(formData: FormData): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return { error: 'Only owners and admins can edit workspace settings' }
  }

  const parsed = settingsSchema.safeParse({
    name: formData.get('name'),
    bir_tin: formData.get('bir_tin') ?? '',
    pcab_license: formData.get('pcab_license') ?? '',
    dpo_contact: formData.get('dpo_contact') ?? '',
  })
  if (!parsed.success) return { error: 'Check the workspace fields and their maximum lengths.' }
  const traceId = randomUUID()
  const event = { trace_id: traceId, tenant_id: profile.tenantId, actor_id: profile.user.id, action: 'tenant.settings.update' }
  let result: { error?: string }
  try {
    result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          name: tenants.name,
          bir_tin: tenants.bir_tin,
          pcab_license: tenants.pcab_license,
          dpo_contact: tenants.dpo_contact,
        })
        .from(tenants)
        .where(eq(tenants.id, profile.tenantId))
        .for('update')
      if (!existing) return { error: 'Workspace not found' }
      const updates = { ...parsed.data, updated_at: new Date() }
      await tx.update(tenants).set(updates).where(eq(tenants.id, profile.tenantId))
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'tenant',
        entityId: profile.tenantId,
        action: 'update',
        diff: { before: existing, after: updates },
      })
      return {}
    })
  } catch {
    console.error({ ...event, outcome: 'failed' })
    return { error: 'Workspace settings could not be saved. No changes were committed.' }
  }
  console.info({ ...event, outcome: result.error ? 'denied' : 'succeeded' })
  if (!result.error) revalidatePath('/settings')
  return result
}
