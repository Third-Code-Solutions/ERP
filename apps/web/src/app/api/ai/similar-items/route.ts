import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { embeddings, users } from '@buildops/database/schema'
import { eq, and } from 'drizzle-orm'
import { findSimilar } from '@buildops/ai'

export interface SimilarItem {
  description: string
  unit_cost_cents: number
  markup_bps: number
  unit: string | null
  score: number
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 403 })

  const { description } = (await req.json()) as { description?: string }
  if (!description?.trim()) return NextResponse.json({ items: [] })

  const process_env_key = process.env.OPENAI_API_KEY
  if (!process_env_key) return NextResponse.json({ items: [], reason: 'AI not configured' })

  // Load all bom_line_item embeddings for this tenant
  const stored = await db
    .select()
    .from(embeddings)
    .where(and(eq(embeddings.tenant_id, userRow.tenant_id), eq(embeddings.entity_type, 'bom_line_item')))

  if (stored.length === 0) return NextResponse.json({ items: [] })

  const results = await findSimilar(description, stored, 5)

  // Parse structured data from chunk_text: "Description | Code: X | Unit: Y | Unit cost: Z PHP | Markup: W%"
  const items: SimilarItem[] = results
    .filter((r) => r.score > 0.75)
    .map((r) => {
      const parts = r.chunk_text.split(' | ')
      const desc = parts[0] ?? r.chunk_text
      const unitMatch = r.chunk_text.match(/Unit: ([^\s|]+)/)
      const costMatch = r.chunk_text.match(/Unit cost: ([\d.]+) PHP/)
      const markupMatch = r.chunk_text.match(/Markup: (\d+)%/)
      return {
        description: desc,
        unit_cost_cents: costMatch ? Math.round(parseFloat(costMatch[1]!) * 100) : 0,
        markup_bps: markupMatch ? parseInt(markupMatch[1]!) * 100 : 3000,
        unit: unitMatch ? unitMatch[1]! : null,
        score: Math.round(r.score * 100),
      }
    })

  return NextResponse.json({ items })
}
