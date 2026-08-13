import 'server-only'

import type {
  CortexChatRetrievalQuery,
  CortexChatRetrievalResult,
} from '@third-code-erp/shared-types'
import {
  cortexChatRetrievalReadsUseCoreApi,
  getCortexChatRetrievalThroughCoreApi,
} from '@/lib/erp-core-client'

export interface CortexChatRetrievalReadSuccess {
  ok: true
  source: 'core'
  retrieval: CortexChatRetrievalResult
}

export interface CortexChatRetrievalReadFailure {
  ok: false
  source: 'core'
  status: number
  error: string
}

export type CortexChatRetrievalReadResult =
  | CortexChatRetrievalReadSuccess
  | CortexChatRetrievalReadFailure

/**
 * Unconnected server-only Core seam for the future chat route. There is no
 * direct database import by design: a selected tenant fails closed on Core
 * error. Conversation ownership/context authorization stays a separate seam.
 */
export async function readCortexChatRetrievalThroughCore(input: {
  tenantId: string
  query: CortexChatRetrievalQuery
}): Promise<CortexChatRetrievalReadResult> {
  if (!cortexChatRetrievalReadsUseCoreApi(input.tenantId)) {
    return {
      ok: false,
      source: 'core',
      status: 503,
      error: 'Cortex chat retrieval Core reads are not enabled for this tenant.',
    }
  }

  const result = await getCortexChatRetrievalThroughCoreApi(input.query)
  if (!result.ok || !result.data) {
    return {
      ok: false,
      source: 'core',
      status: result.status ?? 503,
      error: result.error ?? 'Cortex chat retrieval service is unavailable.',
    }
  }

  return { ok: true, source: 'core', retrieval: result.data }
}
