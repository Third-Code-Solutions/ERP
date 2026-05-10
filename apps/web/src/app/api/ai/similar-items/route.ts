import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { embedText, serializeEmbedding } from '@buildops/ai'
import { writeAuditLog } from '@/lib/audit'

export interface SimilarItem {
  description: string
  unit_cost_cents: number
  markup_bps: number
  unit: string | null
  score: number
}

interface SimilarRow extends Record<string, unknown> {
  chunk_text: string
  score: string | number
}

const MIN_SCORE = 0.75
const TOP_K = 5

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 403 })

  const { description } = (await req.json()) as { description?: string }
  if (!description?.trim()) return NextResponse.json({ items: [] })

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ items: [], reason: 'AI not configured' })
  }

  const queryVec = await embedText(description)
  const queryLiteral = serializeEmbedding(queryVec)

  // SQL-side cosine similarity. The HNSW index on embedding vector_cosine_ops
  // does the heavy lifting; we only filter by tenant + entity type + score.
  const rows = await db.execute<SimilarRow>(sql`
    SELECT
      chunk_text,
      1 - (embedding <=> ${queryLiteral}::vector) AS score
    FROM embeddings
    WHERE tenant_id = ${userRow.tenant_id}
      AND entity_type = 'bom_line_item'
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${queryLiteral}::vector
    LIMIT ${TOP_K}
  `)

  const items: SimilarItem[] = rows
    .map((r) => ({ ...r, score: typeof r.score === 'string' ? parseFloat(r.score) : r.score }))
    .filter((r) => r.score >= MIN_SCORE)
    .map((r) => parseChunkText(r.chunk_text, r.score))

  // PRD F4 explicitly requires "All queries logged for audit". Best-effort —
  // a logging hiccup must never fail the user's actual query.
  try {
    await writeAuditLog({
      tenantId: userRow.tenant_id,
      actorId: user.id,
      entityType: 'ai_similar_items',
      entityId: user.id, // no canonical entity for this query; use actor as anchor
      action: 'query',
      diff: {
        query: description.slice(0, 500),
        result_count: items.length,
        top_score: items[0]?.score ?? null,
      },
    })
  } catch (err) {
    console.error('[ai/similar-items] audit log failed:', err)
  }

  return NextResponse.json({ items })
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
  }
}
