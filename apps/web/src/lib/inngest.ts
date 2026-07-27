import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'third-code-erp' })

// =============================================================================
// CAD parse pipeline
// =============================================================================
//
// Flow:
//   1. /api/upload accepts a .dxf or .dwg file → emits `document/cad.uploaded`
//   2. parseCadDrawing fn calls the Python worker; worker converts DWG→DXF if
//      needed, runs ezdxf extraction, writes scope_items rows.
//   3. On success, the parser fn emits `cad/parsed` with the extracted count.
//   4. calcDraftBomFromScope fn loads the new scope items, runs pgvector
//      similarity search against historical embedded BOM line items, and
//      writes a draft BOM with calculated unit costs and totals.
// =============================================================================

interface CadEventData {
  documentId: string
  projectId: string
  tenantId: string
  storagePath: string
  format: 'dxf' | 'dwg'
  fileName?: string
}

interface ParsedEventData {
  documentId: string
  projectId: string
  tenantId: string
  scopeItemsCreated: number
  sourceFormat: 'dxf' | 'dwg'
}

type Step = { run: <T>(name: string, fn: () => Promise<T>) => Promise<T>; sendEvent?: (id: string, payload: { name: string; data: unknown }) => Promise<unknown> }

export const parseCadDrawing = inngest.createFunction(
  {
    id: 'parse-cad-drawing',
    name: 'Parse CAD Drawing (DXF or DWG)',
    triggers: [
      { event: 'document/cad.uploaded' as const },
      // Backward compat with the old event name
      { event: 'document/dxf.uploaded' as const },
    ],
  },
  async ({
    event,
    step,
  }: {
    event: { data: CadEventData }
    step: Step
  }) => {
    const { documentId, projectId, tenantId, storagePath, format, fileName } = event.data
    const cadFormat = format ?? 'dxf'

    const parserUrl = process.env.DXF_PARSER_URL
    if (!parserUrl) {
      return { skipped: true, reason: 'DXF_PARSER_URL not configured', format: cadFormat }
    }

    const result = await step.run('call-cad-parser', async () => {
      const sharedSecret = process.env.PARSER_SHARED_SECRET
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (sharedSecret) headers.Authorization = `Bearer ${sharedSecret}`
      const res = await fetch(`${parserUrl}/parse`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          document_id: documentId,
          project_id: projectId,
          tenant_id: tenantId,
          storage_path: storagePath,
          format: cadFormat,
          file_name: fileName,
        }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`CAD parser returned ${res.status}: ${detail}`)
      }
      return res.json() as Promise<{ count?: number; source_format?: 'dxf' | 'dwg' }>
    })

    const scopeItemsCreated = result.count ?? 0

    if (scopeItemsCreated > 0) {
      await step.run('emit-cad-parsed', async () => {
        await inngest.send({
          name: 'cad/parsed',
          data: {
            documentId,
            projectId,
            tenantId,
            scopeItemsCreated,
            sourceFormat: result.source_format ?? cadFormat,
          },
        })
      })
    }

    return { parsed: true, scopeItemsCreated, format: cadFormat }
  }
)

// =============================================================================
// Auto-BOM: calculate draft BOM from parsed scope items
// =============================================================================
//
// Implementation lives in @/lib/cad/auto-bom so the same logic powers both
// the queued path (this Inngest function) and the inline path
// (apps/web/src/app/api/upload/complete).

export const calcDraftBomFromScope = inngest.createFunction(
  {
    id: 'calc-draft-bom-from-scope',
    name: 'Calculate Draft BOM From Parsed Scope',
    triggers: [{ event: 'cad/parsed' as const }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: ParsedEventData }
    step: Step
  }) => {
    const { documentId, projectId, tenantId } = event.data

    const result = await step.run('build-draft-bom', async () => {
      const { calcDraftBomFromScope: calcImpl } = await import(
        '@/lib/cad/auto-bom'
      )
      return calcImpl({ tenantId, projectId, documentId })
    })

    return { drafted: true, ...result }
  }
)

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

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { skipped: true, reason: 'OPENAI_API_KEY not configured' }
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

// Backward-compat alias so older imports don't break
export const parseDxf = parseCadDrawing
