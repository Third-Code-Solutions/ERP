import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'third-code-erp' })

type Step = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
}

// =============================================================================
// Embedding refresh: triggered when a BOM is approved
// =============================================================================

export const embedBomLineItems = inngest.createFunction(
  {
    id: 'embed-bom-line-items',
    name: 'Embed BOM Line Items',
    triggers: [{ event: 'bom/approved' as const }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { bomId: string; projectId: string; tenantId: string } }
    step: Step
  }) => {
    const { bomId, tenantId } = event.data

    const { isEmbeddingProviderConfigured } = await import('@third-code-erp/ai')
    if (!isEmbeddingProviderConfigured()) {
      return { skipped: true, reason: 'AI embedding provider not configured' }
    }

    const count = await step.run('embed-line-items', async () => {
      const { db } = await import('@third-code-erp/database')
      const { bomLineItems, embeddings } = await import('@third-code-erp/database/schema')
      const { eq, and } = await import('drizzle-orm')
      const { embedBatch } = await import('@third-code-erp/ai')

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
          embedding: vectors[idx]!,
          model: 'text-embedding-3-small',
        }))
      )

      return lines.length
    })

    return { embedded: count }
  }
)
