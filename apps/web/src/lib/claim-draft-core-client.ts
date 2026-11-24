import 'server-only'
import { randomUUID } from 'node:crypto'
import {
  CLAIM_CAP_EXCEEDED_CODE, createClaimDraftCommandSchema, createClaimDraftResultSchema, type CreateClaimDraftResult,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import { getCoreApiAccess } from '@/lib/erp-core-client'

type ClaimDraftCoreResult =
  | { ok: true; data: CreateClaimDraftResult }
  | { ok: false; status?: number; outcomeUnknown: boolean; error: string; code?: typeof CLAIM_CAP_EXCEEDED_CODE }

export async function createClaimDraftThroughCoreApi(command: unknown): Promise<ClaimDraftCoreResult> {
  const parsed = createClaimDraftCommandSchema.safeParse(command)
  if (!parsed.success) return { ok: false, status: 400, outcomeUnknown: false, error: 'Invalid claim draft command.' }
  const access = await getCoreApiAccess().catch(() => null)
  if (!access?.ok) return { ok: false, outcomeUnknown: false, error: 'The current session cannot reach the claim service.' }
  try {
    const response = await fetch(`${access.baseUrl}/v1/projects/${encodeURIComponent(parsed.data.projectId)}/claims/drafts`, {
      method: 'POST', headers: { authorization: `Bearer ${access.accessToken}`, 'content-type': 'application/json', 'Idempotency-Key': parsed.data.clientRequestId, 'x-request-id': randomUUID() },
      body: JSON.stringify(parsed.data), cache: 'no-store', signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const capMessage = response.status === 409 ? await claimCapMessage(response) : null
      if (capMessage) return { ok: false, status: 409, outcomeUnknown: false, code: CLAIM_CAP_EXCEEDED_CODE, error: capMessage }
      return { ok: false, status: response.status, outcomeUnknown: response.status === 408 || response.status >= 500,
        error: 'The claim service did not confirm this draft.' }
    }
    const body: unknown = await response.json()
    const result = createClaimDraftResultSchema.safeParse(body)
    if (!result.success) return { ok: false, status: 503, outcomeUnknown: true, error: 'The claim service returned an unconfirmed result.' }
    return { ok: true, data: result.data }
  } catch {
    return { ok: false, status: 503, outcomeUnknown: true, error: 'The draft outcome is unconfirmed. Retry the unchanged request.' }
  }
}

/** Core's cap message when the 409 carries the cap code; any other body is not shown. */
async function claimCapMessage(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = z.object({ code: z.literal(CLAIM_CAP_EXCEEDED_CODE), message: z.string().min(1).max(500) }).safeParse(body)
  return parsed.success ? parsed.data.message : null
}
