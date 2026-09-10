'use server'

import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { inspectionRfiTransitionCommandSchema } from '@third-code-erp/shared-types'
import { z } from 'zod'
import { transitionInspectionRfiThroughCoreApi } from '@/lib/erp-core-client'

export interface InspectionRfiTransitionActionState {
  ok: boolean
  error?: string
  success?: string
}

const uuidSchema = z.string().uuid()
const targetSchema = z.enum(['resolve', 'reopen'])

export async function transitionInspectionRfi(
  _previous: InspectionRfiTransitionActionState,
  formData: FormData,
): Promise<InspectionRfiTransitionActionState> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized.' }
  if (!can(profile.role, 'site_inspection.submit')) {
    return {
      ok: false,
      error: 'You do not have permission to change inspection RFIs.',
    }
  }

  const opportunityId = uuidSchema.safeParse(formData.get('opportunityId'))
  const rfiId = uuidSchema.safeParse(formData.get('rfiId'))
  const target = targetSchema.safeParse(formData.get('target'))
  const expectedRaw = formData.get('expectedResolvedAt')
  const expectedResolvedAt =
    typeof expectedRaw === 'string' && expectedRaw.trim() !== ''
      ? expectedRaw
      : null
  const command = inspectionRfiTransitionCommandSchema.safeParse({
    expectedResolvedAt,
    reason: formData.get('reason'),
  })

  if (!opportunityId.success || !rfiId.success || !target.success) {
    return { ok: false, error: 'Invalid inspection RFI transition target.' }
  }
  if (!command.success) {
    return {
      ok: false,
      error: command.error.issues[0]?.message ?? 'A reason is required.',
    }
  }

  const result = await transitionInspectionRfiThroughCoreApi(
    opportunityId.data,
    rfiId.data,
    target.data,
    command.data,
  )
  if (!result.ok || !result.data) {
    return {
      ok: false,
      error: result.error ?? 'Inspection RFI transition was not committed.',
    }
  }

  revalidatePath(
    `/crm/opportunities/${opportunityId.data}/proposal/inspection`,
  )
  return {
    ok: true,
    success: result.data.changed ? 'Updated.' : 'Already in that state.',
  }
}
