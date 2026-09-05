'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient, requireUserProfile } from '@third-code-erp/auth'
import { writeAuditLog } from '@/lib/audit'
import { notificationPreferencesSchema } from './notification-preferences'

export async function saveNotificationPreferences(input: unknown): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const profile = await requireUserProfile()
  const parsed = notificationPreferencesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Choose a valid notification view and refresh setting.' }
  const traceId = randomUUID()
  const audit = {
    tenantId: profile.tenantId, actorId: profile.user.id,
    entityId: profile.user.id, entityType: 'notification_preferences',
    action: 'update' as const,
  }
  try {
    // Auth metadata stores presentation only. Never use it for tenant/role
    // decisions or suppressing mandatory delivery. No caller-supplied identity.
    await writeAuditLog({ ...audit, diff: { operation: 'save_requested', trace_id: traceId, preferences: parsed.data } })
    const supabase = await createSupabaseServerClient()
    const result = await supabase.auth.updateUser({ data: { notification_preferences: parsed.data } })
    if (result.error || result.data.user?.id !== profile.user.id) {
      throw new Error('Preference provider update was not confirmed')
    }
    await writeAuditLog({ ...audit, diff: { operation: 'save_confirmed', trace_id: traceId } })
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: profile.tenantId, actor_id: profile.user.id, action: 'notification_preferences.save', outcome: 'success' }))
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch {
    console.error(JSON.stringify({ trace_id: traceId, tenant_id: profile.tenantId, actor_id: profile.user.id, action: 'notification_preferences.save', outcome: 'unconfirmed' }))
    return { ok: false, error: 'The preference update could not be confirmed. Refresh to check your saved settings, then retry if needed.' }
  }
}
