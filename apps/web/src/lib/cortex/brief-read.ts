import type { AppRole } from '@third-code-erp/auth'
import { getCortexOperationalBrief } from '@third-code-erp/database'
import type { CortexBriefResult } from '@third-code-erp/shared-types'
import {
  cortexBriefReadsUseCoreApi,
  getCortexBriefThroughCoreApi,
} from '@/lib/erp-core-client'
import type { CortexBriefSource } from './brief-presentation'
import { cortexNodeTypeScope } from './rbac'

export interface CortexBriefReadSuccess {
  ok: true
  source: 'core' | 'database'
  brief: CortexBriefSource
}

export interface CortexBriefReadFailure {
  ok: false
  source: 'core'
  status: number
  error: string
}

export type CortexBriefReadResult =
  | CortexBriefReadSuccess
  | CortexBriefReadFailure

function normalizeCoreBrief(result: CortexBriefResult): CortexBriefSource {
  return {
    generatedAt: new Date(result.generatedAt),
    stats: result.stats,
    freshness: result.freshness,
    items: result.items.map((item) => ({
      nodeId: item.id,
      nodeType: item.nodeType,
      title: item.title,
      summary: item.summary,
      refTable: item.refTable,
      refId: item.refId,
      projectId: item.projectId,
      freshness: item.freshness,
      recordedAt: new Date(item.recordedAt),
    })),
  }
}

/**
 * Server-only Cortex brief authority seam. A selected tenant is either served
 * by the authenticated Nest projection or receives a visible failure; it
 * never regains direct database authority after a Core error.
 */
export async function readCortexBrief(input: {
  tenantId: string
  role: AppRole
  limit?: number
}): Promise<CortexBriefReadResult> {
  const limit = input.limit ?? 8

  if (cortexBriefReadsUseCoreApi(input.tenantId)) {
    const result = await getCortexBriefThroughCoreApi(limit)
    if (!result.ok || !result.data) {
      return {
        ok: false,
        source: 'core',
        status: result.status ?? 503,
        error: result.error ?? 'Cortex brief service is unavailable.',
      }
    }

    return {
      ok: true,
      source: 'core',
      brief: normalizeCoreBrief(result.data),
    }
  }

  return {
    ok: true,
    source: 'database',
    brief: await getCortexOperationalBrief(
      input.tenantId,
      cortexNodeTypeScope(input.role),
      limit
    ),
  }
}
