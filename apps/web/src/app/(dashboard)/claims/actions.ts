'use server'

import { requireUserProfile } from '@third-code-erp/auth'
import { createClaimDraftCommand } from './draft-command-actions'
import { parseClaimAmount } from './claim-amount'

/** Compatibility adapter; Core owns all new draft writes and receipts. */
export async function createClaim(formData: FormData): Promise<{ error?: string; id?: string }> {
  const profile = await requireUserProfile()
  const projectId = formData.get('project_id')
  const requestId = formData.get('client_request_id')
  const milestoneRaw = formData.get('milestone_pct')
  const description = formData.get('description')
  const amountCents = parseClaimAmount(formData)
  if (typeof projectId !== 'string' || typeof requestId !== 'string' || typeof milestoneRaw !== 'string' || !/^(?:0|[1-9]\d*)$/.test(milestoneRaw) || amountCents === undefined) {
    return { error: 'Invalid draft command. Refresh and provide a stable request identifier.' }
  }
  const milestonePct = Number(milestoneRaw)
  if (!Number.isSafeInteger(milestonePct) || milestonePct < 0 || milestonePct > 100) return { error: 'Invalid milestone percentage.' }
  const result = await createClaimDraftCommand(
    { tenantId: profile.tenantId, actorId: profile.user.id },
    { projectId, clientRequestId: requestId, milestonePct, amountCents, description: typeof description === 'string' && description.length > 0 ? description : null },
  )
  if (!result.ok) return { error: result.error }
  return { id: result.receipt.claim.id }
}
