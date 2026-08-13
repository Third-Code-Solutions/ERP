'use server'

import { revalidatePath } from 'next/cache'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { tenants } from '@third-code-erp/database/schema'
import { eq } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'

export async function updateTenantSettings(formData: FormData): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return { error: 'Only owners and admins can edit workspace settings' }
  }

  const name = str(formData.get('name'))
  if (!name) return { error: 'Company name is required' }

  const [existing] = await db
    .select({
      name: tenants.name,
      bir_tin: tenants.bir_tin,
      pcab_license: tenants.pcab_license,
      dpo_contact: tenants.dpo_contact,
    })
    .from(tenants)
    .where(eq(tenants.id, profile.tenantId))
  if (!existing) return { error: 'Workspace not found' }

  const updates = {
    name,
    bir_tin: str(formData.get('bir_tin')),
    pcab_license: str(formData.get('pcab_license')),
    dpo_contact: str(formData.get('dpo_contact')),
    updated_at: new Date(),
  }

  await db
    .update(tenants)
    .set(updates)
    .where(eq(tenants.id, profile.tenantId))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'tenant',
    entityId: profile.tenantId,
    action: 'update',
    diff: { before: existing, after: updates },
  })

  revalidatePath('/settings')
  return {}
}

function str(val: FormDataEntryValue | null): string | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined
  return val.trim()
}
