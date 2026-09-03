'use server'

import { revalidatePath } from 'next/cache'
import { requireUserProfile } from '@third-code-erp/auth'
import { opportunityKycTrackCommandSchema } from '@third-code-erp/shared-types'
import {
  applyOpportunityKycTrackAction,
  opportunityKycTrackLabel,
} from '@/lib/operations/opportunity-kyc'
import { notifyRoles } from '@/lib/operations/notifications'

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

  const trackLabel = opportunityKycTrackLabel(parsed.data.track_type)
  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: parsed.data.action === 'approve' ? ['sales', 'finance'] : ['owner', 'admin'],
    subject: `${trackLabel} ${result.status.replace('_', ' ')}`,
    body: `Opportunity ${parsed.data.opportunity_id} ${trackLabel} is now ${result.status.replace('_', ' ')}.`,
    linkUrl: `/crm/opportunities/${parsed.data.opportunity_id}/proposal/pprf`,
  })

  revalidatePath(`/crm/opportunities/${parsed.data.opportunity_id}/proposal/pprf`)
  revalidatePath(`/crm/opportunities/${parsed.data.opportunity_id}/proposal`)
  revalidatePath(`/crm/opportunities/${parsed.data.opportunity_id}`)
  revalidatePath('/crm/kyc-queue')
  revalidatePath('/pipeline')
  return { status: result.status }
}
