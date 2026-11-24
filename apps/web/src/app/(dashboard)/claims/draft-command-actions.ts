'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { can, getUserProfile } from '@third-code-erp/auth'
import {
  CLAIM_CAP_EXCEEDED_CODE, createClaimDraftCommandSchema, createClaimDraftResultSchema, claimDraftPayload,
  type ClaimDraftCommandReceipt,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import { createClaimDraftThroughCoreApi } from '@/lib/claim-draft-core-client'

export interface ClaimDraftScope { tenantId: string; actorId: string }
export type ClaimDraftActionResult =
  | { ok: true; receipt: ClaimDraftCommandReceipt; changed: boolean; warning?: string }
  | { ok: false; outcome: 'rejected' | 'unknown'; error: string }

const uuid = z.string().uuid().transform(value => value.toLowerCase())
const scopeSchema = z.object({ tenantId: uuid, actorId: uuid }).strict()
const unknownOutcome = (): ClaimDraftActionResult => ({
  ok: false, outcome: 'unknown',
  error: 'The draft could not be confirmed. Keep this page open and retry the unchanged draft to recover its receipt.',
})
const rejected = (error: string): ClaimDraftActionResult => ({ ok: false, outcome: 'rejected', error })

export async function createClaimDraftCommand(rawScope: unknown, rawCommand: unknown): Promise<ClaimDraftActionResult> {
  const traceId = randomUUID()
  let admitted: ClaimDraftScope | undefined
  let outcome = 'rejected'
  let dispatched = false
  try {
    const scope = scopeSchema.safeParse(rawScope)
    const parsed = createClaimDraftCommandSchema.safeParse(rawCommand)
    if (!scope.success || !parsed.success) return rejected('Check the project, milestone, exact amount and request identifier.')
    const profile = await getUserProfile().catch(() => null)
    if (!profile || (!can(profile.role, 'kyc.create_ar_code') && !can(profile.role, 'precon.manage_checklist'))) {
      return rejected('Your current session cannot create progress claims.')
    }
    if (profile.tenantId.toLowerCase() !== scope.data.tenantId || profile.user.id.toLowerCase() !== scope.data.actorId) {
      return rejected('Your account or workspace changed. Refresh the claims page.')
    }
    admitted = scope.data
    const command = parsed.data
    dispatched = true
    const result = await createClaimDraftThroughCoreApi(command)
    if (!result.ok) {
      if (result.outcomeUnknown !== false) { outcome = 'unknown'; return unknownOutcome() }
      // The cap message names the amounts and the way out; retrying cannot help.
      if (result.code === CLAIM_CAP_EXCEEDED_CODE) return rejected(result.error)
      return rejected(result.status === 409
        ? 'The draft request conflicts with existing evidence or a concurrent change. An unconfirmed draft must keep its original retry key.'
        : 'The draft was not sent or was rejected. Check your session, permissions and submitted values.')
    }
    const validated = createClaimDraftResultSchema.safeParse(result.data)
    if (!validated.success) { outcome = 'unknown'; return unknownOutcome() }
    const { receipt, changed, created, projectId } = validated.data
    const claim = receipt.claim
    if (created !== changed || projectId !== command.projectId
      || receipt.tenantId !== admitted.tenantId || receipt.actorId !== admitted.actorId
      || receipt.projectId !== command.projectId || receipt.clientRequestId !== command.clientRequestId
      || receipt.payloadHash !== createHash('sha256').update(claimDraftPayload(command)).digest('hex')
      || claim.createdBy !== admitted.actorId || claim.milestonePct !== command.milestonePct
      || claim.amountCents !== command.amountCents || claim.description !== command.description) {
      outcome = 'unknown'
      return unknownOutcome()
    }
    outcome = 'succeeded'
    try {
      revalidatePath('/claims')
      revalidatePath(`/claims/${claim.id}`)
      revalidatePath(`/projects/${projectId}`)
      revalidatePath(`/projects/${projectId}/billing`)
      return { ok: true, receipt, changed }
    } catch {
      outcome = 'succeeded_refresh_pending'
      return { ok: true, receipt, changed, warning: 'Draft confirmed, but the page could not refresh. Open the confirmed claim; do not create a replacement.' }
    }
  } catch {
    outcome = dispatched ? 'unknown' : 'rejected'
    return dispatched ? unknownOutcome() : rejected('The draft was not sent. Check your current session and try again.')
  } finally {
    // Never log entered amounts, descriptions, credentials or provider errors.
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: admitted?.tenantId ?? null, actor_id: admitted?.actorId ?? null, action: 'claim.create_draft', outcome }))
  }
}
