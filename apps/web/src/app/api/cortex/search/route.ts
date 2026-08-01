import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import { searchCortexNodesByTerms } from '@third-code-erp/database'
import {
  cortexEntityDefinition,
  cortexHref,
} from '@/lib/cortex/entity-registry'
import { cortexNodeTypeScope } from '@/lib/cortex/rbac'

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
})

const SEARCH_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
} as const

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

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: SEARCH_HEADERS })
}

/** Keep retrieval terms bounded and literal. Wildcard characters never reach SQL. */
function searchTerms(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3)
    .slice(0, 8)
}

function projectId(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return null
  }
  const value = (attributes as Record<string, unknown>).project_id
  return typeof value === 'string' ? value : null
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

  const terms = searchTerms(parsed.data.q)
  if (terms.length === 0) {
    return response({ hits: [], hint: 'Type a longer keyword.' })
  }

  const nodes = await searchCortexNodesByTerms(
    profile.tenantId,
    terms,
    20,
    cortexNodeTypeScope(profile.role)
  )

  const hits = nodes.flatMap<CortexSearchHit>((node) => {
    const definition = cortexEntityDefinition(node.node_type)
    if (!definition || !definition.refTables.includes(node.ref_table)) return []

    return [
      {
        id: node.id,
        nodeType: node.node_type,
        label: definition.label,
        title: node.title?.trim() || definition.label,
        summary: node.summary?.trim() || null,
        href: cortexHref({
          type: node.node_type,
          refId: node.ref_id,
          projectId: projectId(node.attributes),
        }),
        refTable: node.ref_table,
        refId: node.ref_id,
        freshness: node.freshness,
        source: 'cortex' as const,
      },
    ]
  })

  return response({ hits })
}
