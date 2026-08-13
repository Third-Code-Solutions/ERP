import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import {
  embedText,
  isEmbeddingProviderConfigured,
  serializeEmbedding,
} from '@third-code-erp/ai'
import { writeAuditLog } from '@/lib/audit'
import { canSearchEntity } from '@/app/api/search/search-policy'
import {
  consumeProviderQuota,
  providerQuotaBlockedResponse,
} from '@/lib/provider-quota'

export const runtime = 'nodejs'
export const maxDuration = 10

export interface SimilarItem {
  description: string
  unit_cost_cents: number
  markup_bps: number
  unit: string | null
  score: number
  source: 'approved_bom_history'
}

interface SimilarRow extends Record<string, unknown> {
  chunk_text: string
  score: string | number
}

const MIN_SCORE = 0.75
const TOP_K = 5
const MAX_DESCRIPTION_LENGTH = 300
const requestSchema = z.object({
  description: z.string().trim().min(5).max(MAX_DESCRIPTION_LENGTH),
})

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
} as const

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS })
}

async function auditQuery(
  profile: Awaited<ReturnType<typeof getUserProfile>> & object,
  description: string,
  diff: { result_count: number; top_score: number | null; failure?: string }
) {
  try {
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'ai_similar_items',
      entityId: profile.user.id, // no canonical entity for this query; use actor as anchor
      action: 'query',
      diff: {
        query: description,
        ...diff,
      },
    })
  } catch (err) {
    console.error('[ai/similar-items] audit log failed:', err)
  }
}

export async function POST(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return response({ error: 'Unauthorized' }, 401)
  if (!canSearchEntity(profile.role, 'bom')) {
    return response({ error: 'Forbidden' }, 403)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return response({ items: [], error: 'Invalid JSON body' }, 400)
  }

  // Preserve the old empty-query behavior for the add-line form while
  // bounding all provider input before it can spend credits.
  const rawDescription =
    payload && typeof payload === 'object' && 'description' in payload
      ? (payload as { description?: unknown }).description
      : undefined
  if (typeof rawDescription !== 'string' || !rawDescription.trim()) {
    return response({ items: [] })
  }

  const parsed = requestSchema.safeParse({ description: rawDescription })
  if (!parsed.success) {
    return response(
      { items: [], error: `Description must be 5-${MAX_DESCRIPTION_LENGTH} characters.` },
      400
    )
  }
  const description = parsed.data.description

  if (!isEmbeddingProviderConfigured()) {
    await auditQuery(profile, description, {
      result_count: 0,
      top_score: null,
      failure: 'provider_not_configured',
    })
    return response({ items: [], reason: 'AI not configured' })
  }

  const quota = await consumeProviderQuota(
    'provider-embedding',
    profile.tenantId
  )
  if (!quota.ok) {
    return providerQuotaBlockedResponse(quota, RESPONSE_HEADERS)
  }

  let items: SimilarItem[] = []
  try {
    const queryVec = await embedText(description)
    const queryLiteral = serializeEmbedding(queryVec)

    // SQL-side cosine similarity. The HNSW index on embedding vector_cosine_ops
    // does the heavy lifting; tenant and entity filters remain mandatory.
    const rows = await db.execute<SimilarRow>(sql`
      SELECT
        chunk_text,
        1 - (embedding <=> ${queryLiteral}::vector) AS score
      FROM embeddings
      WHERE tenant_id = ${profile.tenantId}
        AND entity_type = 'bom_line_item'
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${queryLiteral}::vector
      LIMIT ${TOP_K}
    `)

    items = rows
      .map((r) => ({
        ...r,
        score: typeof r.score === 'string' ? parseFloat(r.score) : r.score,
      }))
      .filter((r) => Number.isFinite(r.score) && r.score >= MIN_SCORE && r.score <= 1)
      .map((r) => parseChunkText(r.chunk_text, r.score))
  } catch (err) {
    console.error('[ai/similar-items] retrieval failed:', err)
    await auditQuery(profile, description, {
      result_count: 0,
      top_score: null,
      failure: 'retrieval_unavailable',
    })
    return response({ items: [], reason: 'AI suggestions unavailable' }, 503)
  }

  // All valid AI queries are audit-attempted; a logging hiccup never fails the
  // read-only suggestion request.
  await auditQuery(profile, description, {
    result_count: items.length,
    top_score: items[0]?.score ?? null,
  })

  return response({ items })
}

// Chunk text format from inngest.ts:embedBomLineItems →
// "<description> | Code: <code> | Unit: <unit> | Unit cost: <amount> PHP | Markup: <pct>%"
function parseChunkText(chunk: string, score: number): SimilarItem {
  const parts = chunk.split(' | ')
  const description = parts[0] ?? chunk
  const unitMatch = chunk.match(/Unit: ([^\s|]+)/)
  const costMatch = chunk.match(/Unit cost: ([\d.]+) PHP/)
  const markupMatch = chunk.match(/Markup: (\d+)%/)
  return {
    description,
    unit_cost_cents: costMatch ? Math.round(parseFloat(costMatch[1]!) * 100) : 0,
    markup_bps: markupMatch ? parseInt(markupMatch[1]!, 10) * 100 : 3000,
    unit: unitMatch ? unitMatch[1]! : null,
    score: Math.round(score * 100),
    source: 'approved_bom_history',
  }
}
