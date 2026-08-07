import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import {
  getUnembeddedCortexNodes,
  setCortexNodeEmbedding,
  cortexEmbeddingText,
} from '@third-code-erp/database'
import { embedBatch } from '@third-code-erp/ai'
import { canonicalRole } from '@/lib/operations/nav-config'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'
import {
  consumeProviderQuota,
  providerQuotaBlockedResponse,
} from '@/lib/provider-quota'
import { tenantEnabledForCoreApi } from '@/lib/erp-core-client'

const BATCH_SIZE = 64

/**
 * POST /api/cortex/embed
 *
 * Admin-only. Embeds a batch of the tenant's un-embedded graph nodes so they
 * become available to semantic search. Tenant-scoped throughout (the caller's
 * session tenant), so it can only ever embed its own graph. Call repeatedly
 * until `remaining` is 0 (a cron/Inngest job can drive this).
 *
 * Returns 503 when the embedding provider isn't configured (no OPENAI key) so
 * the rest of the app is unaffected.
 */
export async function POST(_req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORTEX_PRIVATE_HEADERS }
    )
  }
  // Embedding the whole-tenant graph is an admin operation.
  if (canonicalRole(profile.role) !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  if (
    !tenantEnabledForCoreApi(
      profile.tenantId,
      process.env.ERP_CORTEX_LEGACY_EMBED_ENABLED,
      process.env.ERP_CORTEX_LEGACY_EMBED_TENANT_IDS
    )
  ) {
    return NextResponse.json(
      { error: 'Legacy semantic indexing is disabled.' },
      { status: 410, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  const nodes = await getUnembeddedCortexNodes(profile.tenantId, BATCH_SIZE)
  if (nodes.length === 0) {
    return NextResponse.json(
      { embedded: 0, remaining: 0 },
      { headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  const quota = await consumeProviderQuota(
    'provider-embedding',
    profile.tenantId
  )
  if (!quota.ok) {
    return providerQuotaBlockedResponse(quota, CORTEX_PRIVATE_HEADERS)
  }

  try {
    const vectors = await embedBatch(nodes.map((n) => cortexEmbeddingText(n)))
    await Promise.all(
      nodes.map((n, i) => {
        const vec = vectors[i]
        if (!vec) return Promise.resolve()
        return setCortexNodeEmbedding(profile.tenantId, n.id, vec)
      })
    )
  } catch {
    return NextResponse.json(
      { error: 'Embedding provider unavailable' },
      { status: 503, headers: CORTEX_PRIVATE_HEADERS }
    )
  }

  // If we filled a whole batch there are probably more waiting.
  const remaining = nodes.length === BATCH_SIZE ? 1 : 0
  return NextResponse.json(
    { embedded: nodes.length, remaining },
    { headers: CORTEX_PRIVATE_HEADERS }
  )
}
