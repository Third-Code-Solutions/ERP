import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'buildops' })

// Triggered when a document is uploaded to Supabase Storage.
// The DXF parser worker picks this up and writes scope_items rows.
export const parseDxf = inngest.createFunction(
  {
    id: 'parse-dxf',
    name: 'Parse DXF Drawing',
    triggers: [{ event: 'document/dxf.uploaded' as const }],
  },
  async ({ event, step }: { event: { data: { documentId: string; projectId: string; tenantId: string; storagePath: string } }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { documentId, projectId, tenantId, storagePath } = event.data as {
      documentId: string
      projectId: string
      tenantId: string
      storagePath: string
    }

    const parserUrl = process.env.DXF_PARSER_URL
    if (!parserUrl) {
      return { skipped: true, reason: 'DXF_PARSER_URL not configured' }
    }

    const result = await step.run('call-dxf-parser', async () => {
      const res = await fetch(`${parserUrl}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, projectId, tenantId, storagePath }),
      })
      if (!res.ok) throw new Error(`DXF parser returned ${res.status}`)
      return res.json()
    })

    return { parsed: true, scopeItemsCreated: (result as { count?: number }).count ?? 0 }
  }
)

// Triggered when a BOM is approved. Embeds all line items for RAG retrieval.
export const embedBomLineItems = inngest.createFunction(
  {
    id: 'embed-bom-line-items',
    name: 'Embed BOM Line Items',
    triggers: [{ event: 'bom/approved' as const }],
  },
  async ({ event, step }: { event: { data: { bomId: string; projectId: string; tenantId: string } }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { bomId, tenantId } = event.data

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { skipped: true, reason: 'OPENAI_API_KEY not configured' }
    }

    const count = await step.run('embed-line-items', async () => {
      const { db } = await import('@buildops/database')
      const { bomLineItems, embeddings } = await import('@buildops/database/schema')
      const { eq, and } = await import('drizzle-orm')
      const { embedBatch, serializeEmbedding } = await import('@buildops/ai')

      const lines = await db
        .select()
        .from(bomLineItems)
        .where(and(eq(bomLineItems.bom_id, bomId), eq(bomLineItems.tenant_id, tenantId)))

      if (lines.length === 0) return 0

      // Delete existing embeddings for this BOM to avoid duplicates on re-approval
      await db
        .delete(embeddings)
        .where(and(eq(embeddings.entity_id, bomId), eq(embeddings.entity_type, 'bom_line_item')))

      const texts = lines.map((l) => {
        const parts = [l.description]
        if (l.code) parts.push(`Code: ${l.code}`)
        if (l.unit) parts.push(`Unit: ${l.unit}`)
        parts.push(`Unit cost: ${(l.unit_cost_cents / 100).toFixed(2)} PHP`)
        parts.push(`Markup: ${(l.markup_bps / 100).toFixed(0)}%`)
        return parts.join(' | ')
      })

      const vectors = await embedBatch(texts)

      await db.insert(embeddings).values(
        lines.map((l, idx) => ({
          tenant_id: tenantId,
          entity_type: 'bom_line_item',
          entity_id: bomId,
          chunk_index: idx,
          chunk_text: texts[idx]!,
          embedding: serializeEmbedding(vectors[idx]!),
          model: 'text-embedding-3-small',
        }))
      )

      return lines.length
    })

    return { embedded: count }
  }
)
