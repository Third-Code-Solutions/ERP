import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import {
  CORTEX_BRIEF_DEFAULT_LIMIT,
  CORTEX_BRIEF_MAX_LIMIT,
  getCortexOperationalBrief,
} from '@third-code-erp/database'
import {
  cortexEntityDefinition,
  cortexHref,
} from '@/lib/cortex/entity-registry'
import { cortexNodeTypeScope } from '@/lib/cortex/rbac'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'

const querySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CORTEX_BRIEF_MAX_LIMIT)
    .default(CORTEX_BRIEF_DEFAULT_LIMIT),
})

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: CORTEX_PRIVATE_HEADERS,
  })
}

/**
 * GET /api/cortex/brief
 *
 * Returns a small, role-scoped pulse of the latest graph records. The route
 * never accepts a tenant identifier, never calls an AI provider, and drops
 * graph types without a registered human-facing route before serialization.
 */
export async function GET(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return response({ items: [] }, 401)

  const parsed = querySchema.safeParse({
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) {
    return response({ items: [], error: 'Invalid brief limit' }, 400)
  }

  try {
    const scope = cortexNodeTypeScope(profile.role)
    const brief = await getCortexOperationalBrief(
      profile.tenantId,
      scope,
      parsed.data.limit
    )

    const items = brief.items.flatMap((item) => {
      const definition = cortexEntityDefinition(item.nodeType)
      if (!definition || !definition.refTables.includes(item.refTable)) return []

      return [
        {
          id: item.nodeId,
          nodeType: item.nodeType,
          label: definition.label,
          title: item.title?.trim() || definition.label,
          summary: item.summary?.trim() || null,
          href: cortexHref({
            type: item.nodeType,
            refId: item.refId,
            projectId: item.projectId,
          }),
          refTable: item.refTable,
          refId: item.refId,
          freshness: item.freshness,
          recordedAt: item.recordedAt.toISOString(),
          source: 'cortex' as const,
        },
      ]
    })

    return response({
      generatedAt: brief.generatedAt.toISOString(),
      stats: brief.stats,
      freshness: brief.freshness,
      items,
    })
  } catch {
    return response({ items: [], error: 'Cortex brief failed' }, 500)
  }
}
