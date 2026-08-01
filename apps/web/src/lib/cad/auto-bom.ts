// Auto-BOM calculator. Reads auto-extracted scope items for a CAD document,
// looks up similar historical BOM line items via pgvector, and writes a draft
// BOM with calculated unit costs + totals.
//
// Used by both the inline upload pipeline (apps/web/src/app/api/upload/complete)
// and the queued Inngest function (apps/web/src/lib/inngest.ts).

import { db } from '@third-code-erp/database'
import { isEmbeddingProviderConfigured } from '@third-code-erp/ai'
import { boms, bomLineItems, scopeItems } from '@third-code-erp/database/schema'
import { and, eq, like, max, sql } from 'drizzle-orm'
import {
  lineTotal as calcLineTotal,
  computeGP,
  computeGPMargin,
} from '@third-code-erp/shared-types/bom'
import { findCatalogPrice, shouldSkipAutoPrice } from './price-catalog'

const DEFAULT_MARKUP_BPS = 3000 // 30%
const SIMILARITY_THRESHOLD = 0.7
const TOP_K = 1

export interface AutoBomInput {
  tenantId: string
  projectId: string
  documentId: string
}

export interface AutoBomResult {
  bomId: string | null
  scopeCount: number
  totalCostCents: number
  totalTcvCents: number
  gpCents: number
  gpMarginBps: number
  ragMatches: number
  catalogMatches: number
  aiEstimateMatches: number
  unpriced: number
  reason?: string
}

interface SimilarRow extends Record<string, unknown> {
  chunk_text: string
  score: string | number
}

// Format from inngest.ts:embedBomLineItems →
// "<description> | Code: <code> | Unit: <unit> | Unit cost: <amount> PHP | Markup: <pct>%"
function parseChunkText(chunk: string): {
  unit: string | null
  unit_cost_cents: number
  markup_bps: number
} {
  const unitMatch = chunk.match(/Unit: ([^\s|]+)/)
  const costMatch = chunk.match(/Unit cost: ([\d.]+) PHP/)
  const markupMatch = chunk.match(/Markup: (\d+)%/)
  return {
    unit: unitMatch ? unitMatch[1]! : null,
    unit_cost_cents: costMatch ? Math.round(parseFloat(costMatch[1]!) * 100) : 0,
    markup_bps: markupMatch ? parseInt(markupMatch[1]!, 10) * 100 : DEFAULT_MARKUP_BPS,
  }
}

export async function calcDraftBomFromScope(
  input: AutoBomInput
): Promise<AutoBomResult> {
  const { tenantId, projectId, documentId } = input

  const scope = await db
    .select({
      id: scopeItems.id,
      code: scopeItems.code,
      description: scopeItems.description,
      unit: scopeItems.unit,
      quantity: scopeItems.quantity,
      unit_cost_cents: scopeItems.unit_cost_cents,
      notes: scopeItems.notes,
    })
    .from(scopeItems)
    .where(
      and(
        eq(scopeItems.tenant_id, tenantId),
        eq(scopeItems.project_id, projectId),
        like(scopeItems.notes, `%document:${documentId}%`)
      )
    )
    .orderBy(scopeItems.sort_order)

  if (scope.length === 0) {
    return {
      bomId: null,
      scopeCount: 0,
      totalCostCents: 0,
      totalTcvCents: 0,
      gpCents: 0,
      gpMarginBps: 0,
      ragMatches: 0,
      catalogMatches: 0,
      aiEstimateMatches: 0,
      unpriced: 0,
      reason: 'No scope items found for this document',
    }
  }

  const useRag = isEmbeddingProviderConfigured()

  let totalCostCents = 0
  let totalTcvCents = 0
  let ragMatches = 0
  let catalogMatches = 0
  let aiEstimateMatches = 0
  let unpriced = 0

  type PriceSource = 'rag' | 'catalog' | 'manual' | 'ai-estimate' | 'none'

  const calculatedLines: Array<{
    description: string
    unit: string | null
    quantity: number
    unit_cost_cents: number
    markup_bps: number
    line_total_cents: number
    sourceScore: number
    source: PriceSource
    sourceLabel: string | null
  }> = []

  // Lazy-load AI helpers only when we have a key
  const ai = useRag ? await import('@third-code-erp/ai') : null

  for (const item of scope) {
    let unitCostCents = item.unit_cost_cents
    let markupBps = DEFAULT_MARKUP_BPS
    let score = 0
    let unit: string | null = item.unit ?? null

    // The vision extractor writes `price_source:ai_estimated` (or
    // `:shown_in_source`) into scope.notes when it pre-populates a unit_cost.
    // Treat those distinctly from a human "Manual" entry so the BOM badge can
    // tell the estimator "this number came from a 2026 PH-market guess, verify".
    const notes = item.notes ?? ''
    const isAiEstimated = notes.includes('price_source:ai_estimated')
    const isShownInSource = notes.includes('price_source:shown_in_source')

    let source: PriceSource
    if (unitCostCents > 0 && isAiEstimated) source = 'ai-estimate'
    else if (unitCostCents > 0) source = 'manual'
    else source = 'none'

    let sourceLabel: string | null = null
    if (source === 'ai-estimate') {
      sourceLabel = 'AI estimate (PH 2026 market)'
      aiEstimateMatches += 1
    } else if (source === 'manual' && isShownInSource) {
      sourceLabel = 'Price from source document'
    }

    // 1) RAG lookup against historical approved BOMs
    if (useRag && ai && unitCostCents === 0) {
      try {
        const queryVec = await ai.embedText(item.description)
        const queryLiteral = ai.serializeEmbedding(queryVec)
        const rows = await db.execute<SimilarRow>(sql`
          SELECT
            chunk_text,
            1 - (embedding <=> ${queryLiteral}::vector) AS score
          FROM embeddings
          WHERE tenant_id = ${tenantId}
            AND entity_type = 'bom_line_item'
            AND embedding IS NOT NULL
          ORDER BY embedding <=> ${queryLiteral}::vector
          LIMIT ${TOP_K}
        `)
        const top = rows[0]
        if (top) {
          const numericScore =
            typeof top.score === 'string' ? parseFloat(top.score) : top.score
          if (numericScore >= SIMILARITY_THRESHOLD) {
            const parsed = parseChunkText(top.chunk_text)
            unitCostCents = parsed.unit_cost_cents
            markupBps = parsed.markup_bps
            if (parsed.unit) unit = parsed.unit
            score = numericScore
            ragMatches += 1
            source = 'rag'
            sourceLabel = `RAG match (${(numericScore * 100).toFixed(0)}%)`
          }
        }
      } catch (err) {
        // RAG miss should never block BOM creation
        console.error('[auto-bom] RAG lookup failed:', err)
      }
    }

    // 2) Catalog fallback — typical PH industry prices for common items
    if (unitCostCents === 0 && !shouldSkipAutoPrice(item.description)) {
      const match = findCatalogPrice(item.description)
      if (match) {
        unitCostCents = match.unit_cost_cents
        markupBps = match.markup_bps
        if (match.entry.unit) unit = match.entry.unit
        catalogMatches += 1
        source = 'catalog'
        sourceLabel = `Catalog (${match.entry.description})`
      }
    }

    if (unitCostCents === 0) unpriced += 1

    const lineCost = unitCostCents * item.quantity
    const lineTotal = calcLineTotal(unitCostCents, item.quantity, markupBps)

    totalCostCents += lineCost
    totalTcvCents += lineTotal

    calculatedLines.push({
      description: item.description,
      unit,
      quantity: item.quantity,
      unit_cost_cents: unitCostCents,
      markup_bps: markupBps,
      line_total_cents: lineTotal,
      sourceScore: score,
      source,
      sourceLabel,
    })
  }

  const gpCents = computeGP(totalTcvCents, totalCostCents)
  const gpMarginBps = computeGPMargin(gpCents, totalTcvCents)

  const insertedBomId = await db.transaction(async (tx) => {
    // Each auto-BOM is a new version so the BOM page (which loads MAX version)
    // always surfaces the most recent run.
    const [versionRow] = await tx
      .select({ max_version: max(boms.version) })
      .from(boms)
      .where(and(eq(boms.tenant_id, tenantId), eq(boms.project_id, projectId)))
    const nextVersion = (versionRow?.max_version ?? 0) + 1

    const [bom] = await tx
      .insert(boms)
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        version: nextVersion,
        status: 'draft',
        label: 'Auto-drafted from CAD upload',
        total_cost_cents: totalCostCents,
        tcv_cents: totalTcvCents,
        gp_cents: gpCents,
        gp_margin_bps: gpMarginBps,
        notes: `Auto-generated from parsed CAD document ${documentId}. Review and approve before locking.`,
      })
      .returning({ id: boms.id })

    const newBomId = bom!.id

    if (calculatedLines.length > 0) {
      await tx.insert(bomLineItems).values(
        calculatedLines.map((line, idx) => ({
          tenant_id: tenantId,
          bom_id: newBomId,
          sort_order: idx,
          is_group: 0,
          code: null,
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
          unit_cost_cents: line.unit_cost_cents,
          markup_bps: line.markup_bps,
          line_total_cents: line.line_total_cents,
          notes:
            line.source === 'rag'
              ? `Cost from RAG (${line.sourceLabel ?? 'similarity match'}) — verify`
              : line.source === 'catalog'
                ? `Cost from ${line.sourceLabel ?? 'PH industry catalog'} — verify with vendor quote`
                : line.source === 'ai-estimate'
                  ? `Cost from ${line.sourceLabel ?? 'AI estimate'} — verify with vendor quote`
                  : line.source === 'manual'
                    ? line.sourceLabel ?? 'Manual unit cost'
                    : 'No catalog or historical match — estimator must fill in unit cost',
        }))
      )
    }

    return newBomId
  })

  return {
    bomId: insertedBomId,
    scopeCount: scope.length,
    totalCostCents,
    totalTcvCents,
    gpCents,
    gpMarginBps,
    ragMatches,
    catalogMatches,
    aiEstimateMatches,
    unpriced,
  }
}
