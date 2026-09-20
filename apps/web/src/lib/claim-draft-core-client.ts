import 'server-only'
import { randomUUID } from 'node:crypto'
import { createClaimDraftCommandSchema, createClaimDraftResultSchema, type CreateClaimDraftResult } from '@third-code-erp/shared-types'
import { getCoreApiAccess } from '@/lib/erp-core-client'

type ClaimDraftCoreResult =
  | { ok: true; data: CreateClaimDraftResult }
  | { ok: false; status?: number; outcomeUnknown: boolean; error: string }

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
    if (!response.ok) return { ok: false, status: response.status, outcomeUnknown: response.status === 408 || response.status >= 500,
      error: 'The claim service did not confirm this draft.' }
    const body: unknown = await response.json()
    const result = createClaimDraftResultSchema.safeParse(body)
    if (!result.success) return { ok: false, status: 503, outcomeUnknown: true, error: 'The claim service returned an unconfirmed result.' }
    return { ok: true, data: result.data }
  } catch {
    return { ok: false, status: 503, outcomeUnknown: true, error: 'The draft outcome is unconfirmed. Retry the unchanged request.' }
  }
}
