'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { accounts, opportunities } from '@third-code-erp/database/schema'
import { opportunityKycTrackCommandSchema } from '@third-code-erp/shared-types'
import {
  applyOpportunityKycTrackAction,
  opportunityKycTrackLabel,
} from '@/lib/operations/opportunity-kyc'
import { notifyRoles } from '@/lib/operations/notifications'
import { kycTrackNotification } from './kyc-notification'

export async function updateOpportunityKycTrack(
  formData: FormData
): Promise<{ error?: string; status?: string }> {
  const profile = await requireUserProfile()
  const parsed = opportunityKycTrackCommandSchema.safeParse({
    opportunity_id: formData.get('opportunity_id'),
    track_type: formData.get('track_type'),
    action: formData.get('action'),
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'command'}: ${first?.message || 'invalid input'}` }
  }

  const result = await applyOpportunityKycTrackAction({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    actorRole: profile.role,
    input: parsed.data,
  })
  if (!result.ok) return { error: result.error }

  const [account] = await db
    .select({ name: accounts.name })
    .from(opportunities)
    .leftJoin(
      accounts,
      and(eq(accounts.id, opportunities.account_id), eq(accounts.tenant_id, profile.tenantId))
    )
    .where(
      and(
        eq(opportunities.id, parsed.data.opportunity_id),
        eq(opportunities.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  const notification = kycTrackNotification({
    action: parsed.data.action,
    status: result.status,
    trackLabel: opportunityKycTrackLabel(parsed.data.track_type),
    accountName: account?.name ?? null,
  })
  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: notification.recipientRoles,
    subject: notification.subject,
    body: notification.body,
    linkUrl: `/crm/opportunities/${parsed.data.opportunity_id}/proposal/pprf`,
  })

  revalidatePath(`/crm/opportunities/${parsed.data.opportunity_id}/proposal/pprf`)
  revalidatePath(`/crm/opportunities/${parsed.data.opportunity_id}/proposal`)
  revalidatePath(`/crm/opportunities/${parsed.data.opportunity_id}`)
  revalidatePath('/crm/kyc-queue')
  revalidatePath('/pipeline')
  return { status: result.status }
}
