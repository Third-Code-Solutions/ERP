import 'server-only'

import type {
  CortexConversationContextResolveQuery,
  CortexConversationContextResolveResponse,
} from '@third-code-erp/shared-types'
import {
  cortexConversationContextReadsUseCoreApi,
  getCortexConversationContextThroughCoreApi,
} from '@/lib/erp-core-client'

export interface CortexConversationContextReadSuccess {
  ok: true
  source: 'core'
  resolution: CortexConversationContextResolveResponse
}

export interface CortexConversationContextReadFailure {
  ok: false
  source: 'core'
  status: number
  error: string
}

export type CortexConversationContextReadResult =
  | CortexConversationContextReadSuccess
  | CortexConversationContextReadFailure

/**
 * Unconnected owner/context seam for the future chat route. Core owns tenant,
 * user, role, conversation ownership, and record authorization; a selected
 * tenant never falls back to direct database authority after Core failure.
 */
export async function readCortexConversationContextThroughCore(input: {
  tenantId: string
  query: CortexConversationContextResolveQuery
}): Promise<CortexConversationContextReadResult> {
  if (!cortexConversationContextReadsUseCoreApi(input.tenantId)) {
    return {
      ok: false,
      source: 'core',
      status: 503,
      error:
        'Cortex conversation context Core reads are not enabled for this tenant.',
    }
  }

  const result = await getCortexConversationContextThroughCoreApi(input.query)
  if (!result.ok || !result.data) {
    return {
      ok: false,
      source: 'core',
      status: result.status ?? 503,
      error:
        result.error ?? 'Cortex conversation context service is unavailable.',
    }
  }

  return { ok: true, source: 'core', resolution: result.data }
}
