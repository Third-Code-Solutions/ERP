import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import { searchCortexNodesByTerms } from '@third-code-erp/database'
import {
  cortexSearchTerms,
  type CortexSearchResult,
} from '@third-code-erp/shared-types'
import {
  cortexEntityDefinition,
  cortexHref,
} from '@/lib/cortex/entity-registry'
import { cortexNodeTypeScope } from '@/lib/cortex/rbac'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'
import {
  cortexSearchUseCoreApi,
  searchCortexThroughCoreApi,
} from '@/lib/erp-core-client'

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
})

export interface CortexSearchHit {
  id: string
  nodeType: string
  label: string
  title: string
  summary: string | null
  href: string | null
  refTable: string
  refId: string
  freshness: string
  source: 'cortex'
}

interface CortexSearchRecord {
  id: string
  nodeType: string
  title: string | null
  summary: string | null
  refTable: string
  refId: string
  projectId: string | null
  freshness: string
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: CORTEX_PRIVATE_HEADERS,
  })
}

function projectId(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return null
  }
  const value = (attributes as Record<string, unknown>).project_id
  return typeof value === 'string' ? value : null
}

function toHit(record: CortexSearchRecord): CortexSearchHit | null {
  const definition = cortexEntityDefinition(record.nodeType)
  if (!definition || !definition.refTables.includes(record.refTable)) {
    return null
  }

  return {
    id: record.id,
    nodeType: record.nodeType,
    label: definition.label,
    title: record.title?.trim() || definition.label,
    summary: record.summary?.trim() || null,
    href: cortexHref({
      type: record.nodeType,
      refId: record.refId,
      projectId: record.projectId,
    }),
    refTable: record.refTable,
    refId: record.refId,
    freshness: record.freshness,
    source: 'cortex',
  }
}

/**
 * GET /api/cortex/search
 *
 * Source-cited keyword retrieval over the tenant's derived Cortex graph. The
 * session supplies tenant and role; request input supplies only the bounded
 * query. Semantic/LLM retrieval stays opt-in through Cortex chat, so command
 * search never spends provider credits while a user types.
 */
export async function GET(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return response({ hits: [] }, 401)

  const parsed = querySchema.safeParse({
    q: req.nextUrl.searchParams.get('q') ?? '',
  })
  if (!parsed.success) {
    return response({ hits: [], hint: 'Type at least 2 characters.' }, 400)
  }

  const terms = cortexSearchTerms(parsed.data.q)
  if (terms.length === 0) {
    return response({ hits: [], hint: 'Type a longer keyword.' })
  }

  if (cortexSearchUseCoreApi(profile.tenantId)) {
    const result = await searchCortexThroughCoreApi(parsed.data.q, 20)
    if (!result.ok || !result.data) {
      return response(
        { hits: [], error: result.error ?? 'Cortex search service is unavailable.' },
        result.status ?? 503
      )
    }

    const hits = result.data.hits.flatMap((hit: CortexSearchResult['hits'][number]) => {
      const mapped = toHit(hit)
      return mapped ? [mapped] : []
    })
    return response({ hits })
  }

  const nodes = await searchCortexNodesByTerms(
    profile.tenantId,
    terms,
    20,
    cortexNodeTypeScope(profile.role)
  )

  const hits = nodes.flatMap<CortexSearchHit>((node) => {
    const mapped = toHit({
      id: node.id,
      nodeType: node.node_type,
      title: node.title,
      summary: node.summary,
      refTable: node.ref_table,
      refId: node.ref_id,
      projectId: projectId(node.attributes),
      freshness: node.freshness,
    })
    return mapped ? [mapped] : []
  })

  return response({ hits })
}
