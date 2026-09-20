import 'server-only'

import {
  claimTransitionCommandSchema,
  claimTransitionResultSchema,
  type ClaimTransitionResult,
} from '@third-code-erp/shared-types'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getCoreApiAccess } from '@/lib/erp-core-client'

type ClaimTransitionCoreResult =
  | { ok: true; data: ClaimTransitionResult }
  | { ok: false; status?: number; outcomeUnknown: boolean; error: string }

export async function transitionClaimThroughCoreApi(
  claimId: string,
  command: unknown,
): Promise<ClaimTransitionCoreResult> {
  const parsedClaimId = typeof claimId === 'string' ? claimId.toLowerCase() : claimId
  const parsedCommand = claimTransitionCommandSchema.safeParse(command)
  if (!z.string().uuid().safeParse(parsedClaimId).success || !parsedCommand.success) {
    return { ok: false, status: 400, outcomeUnknown: false, error: 'Invalid claim transition command.' }
  }
  const access = await getCoreApiAccess().catch(() => null)
  if (!access?.ok) return { ok: false, status: 503, outcomeUnknown: true, error: 'The claim service could not be reached.' }
  try {
    const response = await fetch(`${access.baseUrl}/v1/claims/${encodeURIComponent(parsedClaimId)}/transition`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        'content-type': 'application/json',
        'Idempotency-Key': parsedCommand.data.clientRequestId,
        'x-request-id': randomUUID(),
      },
      body: JSON.stringify(parsedCommand.data),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        outcomeUnknown: response.status === 408 || response.status >= 500,
        error: 'The claim service did not confirm this transition.',
      }
    }
    const body: unknown = await response.json()
    const result = claimTransitionResultSchema.safeParse(body)
    if (!result.success) return { ok: false, status: 503, outcomeUnknown: true, error: 'The claim service returned an unconfirmed transition.' }
    return { ok: true, data: result.data }
  } catch {
    return { ok: false, status: 503, outcomeUnknown: true, error: 'The transition outcome is unconfirmed. Retry the unchanged command.' }
  }
}
