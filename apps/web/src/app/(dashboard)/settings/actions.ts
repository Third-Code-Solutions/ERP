'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { tenants, users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'

export async function updateTenantSettings(formData: FormData): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id, role: users.role })
    .from(users)
    .where(eq(users.id, user.id))

  if (!userRow?.tenant_id) return { error: 'No tenant' }
  if (userRow.role !== 'owner' && userRow.role !== 'admin') return { error: 'Only owners and admins can edit workspace settings' }

  const name = str(formData.get('name'))
  if (!name) return { error: 'Company name is required' }

  await db
    .update(tenants)
    .set({
      name,
      bir_tin: str(formData.get('bir_tin')),
      pcab_license: str(formData.get('pcab_license')),
      dpo_contact: str(formData.get('dpo_contact')),
      updated_at: new Date(),
    })
    .where(eq(tenants.id, userRow.tenant_id))

  revalidatePath('/settings')
  return {}
}

function str(val: FormDataEntryValue | null): string | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined
  return val.trim()
}
