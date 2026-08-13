import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import { db, type Database } from '@third-code-erp/database'
import {
  materialCatalog,
  materialItems,
  priceHistory,
  rfqQuotes,
  rfqs,
  vendors,
} from '@third-code-erp/database/schema'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

type RfqStatus =
  | 'pending'
  | 'quotes_received'
  | 'completed'
  | 'cancelled'

interface RfqLineItemJson {
  bom_line_item_id?: string
  material_item_id: string | null
  code: string | null
  description: string
  qty: number
  unit: string | null
}

interface RfqPriceLine {
  code: string
  description: string
  unit: string
}

export interface LogRfqQuoteParams {
  tenantId: string
  actorId: string
  rfqId: string
  bomLineItemId: string
  vendorId: string
  submissionId: string
  unitPriceCents: number
  leadTimeDays?: number
  validUntil?: Date
  notes?: string
}

export type LogRfqQuoteResult =
  | {
      quoteId: string
      created: boolean
      statusChanged: boolean
      priceHistoryId: string
    }
  | { error: string }

export interface TransitionRfqParams {
  tenantId: string
  actorId: string
  rfqId: string
  command: 'complete' | 'cancel'
  reason?: string
}

export type TransitionRfqResult =
  | {
      rfqId: string
      tenantId: string
      transitioned: true
    }
  | { error: string }

export type AwardRfqQuoteResult =
  | {
      rfqId: string
      quoteId: string
      tenantId: string
      priceHistoryId: string
      awarded: true
    }
  | { error: string }

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError(`Invalid internal ${label}`)
  }
}

function parseLineItems(value: unknown): RfqLineItemJson[] {
  if (!Array.isArray(value)) return []

  return value.filter(
    (line): line is RfqLineItemJson =>
      typeof line === 'object' &&
      line !== null &&
      typeof (line as { description?: unknown }).description ===
        'string'
  )
}

function findLine(
  lineItems: RfqLineItemJson[],
  bomLineItemId: string
): RfqLineItemJson | undefined {
  return lineItems.find(
    (line) => line.bom_line_item_id === bomLineItemId
  )
}

function sameDate(
  left: Date | null,
  right: Date | undefined
): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null)
}

function isExactReplay(
  existing: {
    rfq_id: string
    bom_line_item_id: string | null
    vendor_id: string
    material_item_id: string | null
    unit_price_cents: number
    lead_time_days: number | null
    valid_until: Date | null
    notes: string | null
  },
  params: LogRfqQuoteParams,
  materialItemId: string | null
): boolean {
  return (
    existing.rfq_id === params.rfqId &&
    existing.bom_line_item_id === params.bomLineItemId &&
    existing.vendor_id === params.vendorId &&
    existing.material_item_id === materialItemId &&
    existing.unit_price_cents === params.unitPriceCents &&
    existing.lead_time_days === (params.leadTimeDays ?? null) &&
    sameDate(existing.valid_until, params.validUntil) &&
    existing.notes === (params.notes ?? null)
  )
}

function lineIsCovered(
  line: RfqLineItemJson,
  quotes: Array<{
    bom_line_item_id: string | null
    material_item_id: string | null
    material_code: string | null
  }>
): boolean {
  if (
    line.bom_line_item_id &&
    quotes.some(
      (quote) =>
        quote.bom_line_item_id === line.bom_line_item_id
    )
  ) {
    return true
  }
  if (
    line.material_item_id &&
    quotes.some(
      (quote) =>
        quote.material_item_id === line.material_item_id
    )
  ) {
    return true
  }
  return Boolean(
    line.code &&
      quotes.some((quote) => quote.material_code === line.code)
  )
}

async function resolvePriceLine(
  tx: DatabaseTransaction,
  line: RfqLineItemJson,
  tenantId: string,
): Promise<RfqPriceLine> {
  let code = line.code?.trim() ?? ''
  let description = line.description.trim()
  let unit = line.unit?.trim() ?? ''

  if (line.material_item_id) {
    const [material] = await tx
      .select({
        code: materialItems.code,
        description: materialItems.description,
        unit: materialItems.unit,
      })
      .from(materialItems)
      .where(
        and(
          eq(materialItems.id, line.material_item_id),
          eq(materialItems.tenant_id, tenantId),
        ),
      )
      .limit(1)

    if (!material) return Promise.reject(new Error('Material item not found'))
    code ||= material.code.trim()
    description ||= material.description.trim()
    unit ||= material.unit.trim()
  }

  if (!code) {
    return Promise.reject(
      new Error(
        'Selected RFQ line needs a material code before price history can be recorded',
      ),
    )
  }
  if (!description || !unit) {
    return Promise.reject(
      new Error('Selected RFQ line is missing catalog description or unit'),
    )
  }

  return { code, description, unit }
}

async function ensureQuotePriceHistory(
  tx: DatabaseTransaction,
  input: {
    tenantId: string
    actorId: string
    rfqId: string
    quoteId: string
    vendorId: string
    unitPriceCents: number
    line: RfqLineItemJson
  },
): Promise<string> {
  const [existingHistory] = await tx
    .select({ id: priceHistory.id })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.tenant_id, input.tenantId),
        eq(priceHistory.source_rfq_quote_id, input.quoteId),
      ),
    )
    .limit(1)

  if (existingHistory) return existingHistory.id

  const priceLine = await resolvePriceLine(tx, input.line, input.tenantId)
  const today = new Date().toISOString().slice(0, 10)
  const [catalog] = await tx
    .select({ id: materialCatalog.id })
    .from(materialCatalog)
    .where(
      and(
        eq(materialCatalog.tenant_id, input.tenantId),
        eq(materialCatalog.code, priceLine.code),
      ),
    )
    .limit(1)
    .for('update')

  let catalogId = catalog?.id
  const catalogAction = catalogId ? 'update' : 'create'
  if (!catalogId) {
    const [createdCatalog] = await tx
      .insert(materialCatalog)
      .values({
        tenant_id: input.tenantId,
        code: priceLine.code,
        description: priceLine.description,
        base_uom: priceLine.unit,
        current_rate_centavos: BigInt(input.unitPriceCents),
        rate_source: 'rfq',
        last_updated_at: new Date(),
        created_by: input.actorId,
        updated_by: input.actorId,
      })
      .onConflictDoNothing({
        target: [materialCatalog.tenant_id, materialCatalog.code],
      })
      .returning({ id: materialCatalog.id })
    catalogId = createdCatalog?.id
    if (!catalogId) {
      const [racedCatalog] = await tx
        .select({ id: materialCatalog.id })
        .from(materialCatalog)
        .where(
          and(
            eq(materialCatalog.tenant_id, input.tenantId),
            eq(materialCatalog.code, priceLine.code),
          ),
        )
        .limit(1)
        .for('update')
      catalogId = racedCatalog?.id
    }
  }

  if (!catalogId) throw new Error('Material catalog identity was not created')

  const [updatedCatalog] = await tx
    .update(materialCatalog)
    .set({
      current_rate_centavos: BigInt(input.unitPriceCents),
      rate_source: 'rfq',
      last_updated_at: new Date(),
      updated_by: input.actorId,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(materialCatalog.id, catalogId),
        eq(materialCatalog.tenant_id, input.tenantId),
      ),
    )
    .returning({ id: materialCatalog.id })
  if (!updatedCatalog) throw new Error('Material catalog update failed')

  await writeAuditLogInTransaction(tx, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    entityType: 'material_catalog',
    entityId: catalogId,
    action: catalogAction,
    diff: {
      code: priceLine.code,
      source_type: 'rfq',
      source_rfq_id: input.rfqId,
      source_rfq_quote_id: input.quoteId,
      current_rate_centavos: input.unitPriceCents,
    },
  })

  const [history] = await tx
    .insert(priceHistory)
    .values({
      tenant_id: input.tenantId,
      catalog_item_id: catalogId,
      vendor_id: input.vendorId,
      quoted_rate_centavos: BigInt(input.unitPriceCents),
      source_type: 'quote',
      source_document: `rfq:${input.rfqId}`,
      source_rfq_id: input.rfqId,
      source_rfq_quote_id: input.quoteId,
      occurred_at: today,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .returning({ id: priceHistory.id })
  if (!history) throw new Error('RFQ quote price history was not created')

  await writeAuditLogInTransaction(tx, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    entityType: 'price_history',
    entityId: history.id,
    action: 'create',
    diff: {
      source_type: 'quote',
      source_rfq_id: input.rfqId,
      source_rfq_quote_id: input.quoteId,
      catalog_item_id: catalogId,
      vendor_id: input.vendorId,
      quoted_rate_centavos: input.unitPriceCents,
      occurred_at: today,
    },
  })

  return history.id
}

export async function logRfqQuoteRecord(
  params: LogRfqQuoteParams
): Promise<LogRfqQuoteResult> {
  for (const [label, value] of [
    ['tenant identity', params.tenantId],
    ['actor identity', params.actorId],
    ['RFQ identity', params.rfqId],
    ['BOM line identity', params.bomLineItemId],
    ['vendor identity', params.vendorId],
    ['submission identity', params.submissionId],
  ] as const) {
    assertUuid(value, label)
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${
        'rfq_quote_submission:' +
        params.tenantId +
        ':' +
        params.submissionId
      }, 0))`
    )

    const [rfq] = await tx
      .select({
        id: rfqs.id,
        status: rfqs.status,
        line_items: rfqs.line_items,
      })
      .from(rfqs)
      .where(
        and(
          eq(rfqs.id, params.rfqId),
          eq(rfqs.tenant_id, params.tenantId)
        )
      )
      .limit(1)
      .for('update')

    if (!rfq) return { error: 'RFQ not found' }

    const line = findLine(
      parseLineItems(rfq.line_items),
      params.bomLineItemId
    )
    if (!line) return { error: 'Selected RFQ line is unavailable' }

    const materialItemId =
      typeof line.material_item_id === 'string'
        ? line.material_item_id
        : null

    const [existing] = await tx
      .select({
        id: rfqQuotes.id,
        rfq_id: rfqQuotes.rfq_id,
        bom_line_item_id: rfqQuotes.bom_line_item_id,
        vendor_id: rfqQuotes.vendor_id,
        material_item_id: rfqQuotes.material_item_id,
        unit_price_cents: rfqQuotes.unit_price_cents,
        lead_time_days: rfqQuotes.lead_time_days,
        valid_until: rfqQuotes.valid_until,
        notes: rfqQuotes.notes,
      })
      .from(rfqQuotes)
      .where(
        and(
          eq(rfqQuotes.tenant_id, params.tenantId),
          eq(rfqQuotes.submission_id, params.submissionId)
        )
      )
      .limit(1)

    if (existing) {
      if (!isExactReplay(existing, params, materialItemId)) {
        return { error: 'Quote submission conflict' }
      }
      const priceHistoryId = await ensureQuotePriceHistory(tx, {
        tenantId: params.tenantId,
        actorId: params.actorId,
        rfqId: params.rfqId,
        quoteId: existing.id,
        vendorId: existing.vendor_id,
        unitPriceCents: existing.unit_price_cents,
        line,
      })
      return {
        quoteId: existing.id,
        created: false,
        statusChanged: false,
        priceHistoryId,
      }
    }

    if (
      rfq.status === 'cancelled' ||
      rfq.status === 'completed'
    ) {
      return {
        error: `Cannot log quotes on a ${rfq.status} RFQ`,
      }
    }

    const [vendor] = await tx
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.id, params.vendorId),
          eq(vendors.tenant_id, params.tenantId)
        )
      )
      .limit(1)
    if (!vendor) return { error: 'Vendor not found' }

    if (materialItemId) {
      const [material] = await tx
        .select({ id: materialItems.id })
        .from(materialItems)
        .where(
          and(
            eq(materialItems.id, materialItemId),
            eq(materialItems.tenant_id, params.tenantId)
          )
        )
        .limit(1)
      if (!material) return { error: 'Material item not found' }
    }

    try {
      await resolvePriceLine(tx, line, params.tenantId)
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'RFQ line cannot be priced',
      }
    }

    const [created] = await tx
      .insert(rfqQuotes)
      .values({
        tenant_id: params.tenantId,
        submission_id: params.submissionId,
        rfq_id: params.rfqId,
        bom_line_item_id: params.bomLineItemId,
        vendor_id: params.vendorId,
        material_item_id: materialItemId,
        unit_price_cents: params.unitPriceCents,
        lead_time_days: params.leadTimeDays,
        valid_until: params.validUntil,
        notes: params.notes,
        created_by: params.actorId,
      })
      .returning({ id: rfqQuotes.id })

    if (!created) {
      throw new Error('RFQ quote insert returned no record')
    }

    const statusChanged = rfq.status === 'pending'
    if (statusChanged) {
      const [updated] = await tx
        .update(rfqs)
        .set({
          status: 'quotes_received',
          updated_at: new Date(),
        })
        .where(
          and(
            eq(rfqs.id, params.rfqId),
            eq(rfqs.tenant_id, params.tenantId),
            eq(rfqs.status, 'pending')
          )
        )
        .returning({ id: rfqs.id })
      if (!updated) {
        throw new Error('RFQ status update lost its row lock')
      }
    }

    await writeAuditLogInTransaction(tx, {
      tenantId: params.tenantId,
      actorId: params.actorId,
      entityType: 'rfq_quote',
      entityId: created.id,
      action: 'create',
      diff: {
        rfq_id: params.rfqId,
        bom_line_item_id: params.bomLineItemId,
        vendor_id: params.vendorId,
        unit_price_cents: params.unitPriceCents,
        submission_id: params.submissionId,
      },
    })

    if (statusChanged) {
      await writeAuditLogInTransaction(tx, {
        tenantId: params.tenantId,
        actorId: params.actorId,
        entityType: 'rfq',
        entityId: params.rfqId,
        action: 'status_change',
        diff: {
          from: 'pending',
          to: 'quotes_received',
          source: 'first_quote',
        },
      })
    }

    const priceHistoryId = await ensureQuotePriceHistory(tx, {
      tenantId: params.tenantId,
      actorId: params.actorId,
      rfqId: params.rfqId,
      quoteId: created.id,
      vendorId: params.vendorId,
      unitPriceCents: params.unitPriceCents,
      line,
    })

    return {
      quoteId: created.id,
      created: true,
      statusChanged,
      priceHistoryId,
    }
  })
}

export async function awardRfqQuoteRecord(params: {
  tenantId: string
  actorId: string
  rfqId: string
  quoteId: string
}): Promise<AwardRfqQuoteResult> {
  for (const [label, value] of [
    ['tenant identity', params.tenantId],
    ['actor identity', params.actorId],
    ['RFQ identity', params.rfqId],
    ['quote identity', params.quoteId],
  ] as const) {
    assertUuid(value, label)
  }

  return db.transaction(async (tx) => {
    const [rfq] = await tx
      .select({ id: rfqs.id, status: rfqs.status, line_items: rfqs.line_items })
      .from(rfqs)
      .where(and(eq(rfqs.id, params.rfqId), eq(rfqs.tenant_id, params.tenantId)))
      .limit(1)
      .for('update')
    if (!rfq) return { error: 'RFQ not found' }
    if (rfq.status === 'cancelled') return { error: 'Cannot award a cancelled RFQ' }
    if (rfq.status !== 'completed') {
      return { error: 'RFQ must be completed before a quote can be awarded' }
    }

    const [quote] = await tx
      .select({
        id: rfqQuotes.id,
        bom_line_item_id: rfqQuotes.bom_line_item_id,
        vendor_id: rfqQuotes.vendor_id,
        material_item_id: rfqQuotes.material_item_id,
        unit_price_cents: rfqQuotes.unit_price_cents,
      })
      .from(rfqQuotes)
      .where(
        and(
          eq(rfqQuotes.id, params.quoteId),
          eq(rfqQuotes.rfq_id, params.rfqId),
          eq(rfqQuotes.tenant_id, params.tenantId),
        ),
      )
      .limit(1)
      .for('update')
    if (!quote) return { error: 'RFQ quote not found' }

    const line = parseLineItems(rfq.line_items).find(
      (item) => item.bom_line_item_id === quote.bom_line_item_id,
    )
    if (!line) return { error: 'Selected RFQ line is unavailable' }

    const [existingHistory] = await tx
      .select({ id: priceHistory.id, awarded_rate_centavos: priceHistory.awarded_rate_centavos })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.tenant_id, params.tenantId),
          eq(priceHistory.source_rfq_quote_id, quote.id),
        ),
      )
      .limit(1)
      .for('update')

    if (existingHistory?.awarded_rate_centavos != null) {
      return {
        rfqId: params.rfqId,
        quoteId: params.quoteId,
        tenantId: params.tenantId,
        priceHistoryId: existingHistory.id,
        awarded: true,
      }
    }

    const [otherAward] = quote.bom_line_item_id
      ? await tx
          .select({ id: priceHistory.id })
          .from(priceHistory)
          .innerJoin(
            rfqQuotes,
            and(
              eq(priceHistory.source_rfq_quote_id, rfqQuotes.id),
              eq(rfqQuotes.tenant_id, params.tenantId),
            ),
          )
          .where(
            and(
              eq(priceHistory.tenant_id, params.tenantId),
              eq(priceHistory.source_rfq_id, params.rfqId),
              eq(priceHistory.source_type, 'award'),
              eq(rfqQuotes.bom_line_item_id, quote.bom_line_item_id),
            ),
          )
          .limit(1)
      : []
    if (otherAward) return { error: 'A quote is already awarded for this RFQ line' }

    const priceHistoryId = existingHistory?.id ?? await ensureQuotePriceHistory(tx, {
      tenantId: params.tenantId,
      actorId: params.actorId,
      rfqId: params.rfqId,
      quoteId: quote.id,
      vendorId: quote.vendor_id,
      unitPriceCents: quote.unit_price_cents,
      line,
    })

    const [updatedHistory] = await tx
      .update(priceHistory)
      .set({
        awarded_rate_centavos: BigInt(quote.unit_price_cents),
        source_type: 'award',
        updated_by: params.actorId,
        updated_at: new Date(),
      })
      .where(and(eq(priceHistory.id, priceHistoryId), eq(priceHistory.tenant_id, params.tenantId)))
      .returning({ id: priceHistory.id, catalog_item_id: priceHistory.catalog_item_id })
    if (!updatedHistory) throw new Error('RFQ award price history update failed')

    const [updatedCatalog] = await tx
      .update(materialCatalog)
      .set({
        current_rate_centavos: BigInt(quote.unit_price_cents),
        rate_source: 'rfq',
        last_updated_at: new Date(),
        updated_by: params.actorId,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(materialCatalog.id, updatedHistory.catalog_item_id),
          eq(materialCatalog.tenant_id, params.tenantId),
        ),
      )
      .returning({ id: materialCatalog.id })
    if (!updatedCatalog) throw new Error('Award catalog update failed')

    await writeAuditLogInTransaction(tx, {
      tenantId: params.tenantId,
      actorId: params.actorId,
      entityType: 'price_history',
      entityId: priceHistoryId,
      action: 'update',
      diff: {
        source_type: 'award',
        source_rfq_id: params.rfqId,
        source_rfq_quote_id: params.quoteId,
        awarded_rate_centavos: quote.unit_price_cents,
      },
    })
    await writeAuditLogInTransaction(tx, {
      tenantId: params.tenantId,
      actorId: params.actorId,
      entityType: 'material_catalog',
      entityId: updatedHistory.catalog_item_id,
      action: 'update',
      diff: {
        source_type: 'award',
        source_rfq_id: params.rfqId,
        source_rfq_quote_id: params.quoteId,
        current_rate_centavos: quote.unit_price_cents,
      },
    })

    return {
      rfqId: params.rfqId,
      quoteId: params.quoteId,
      tenantId: params.tenantId,
      priceHistoryId,
      awarded: true,
    }
  })
}

export async function transitionRfqRecord(
  params: TransitionRfqParams
): Promise<TransitionRfqResult> {
  assertUuid(params.tenantId, 'tenant identity')
  assertUuid(params.actorId, 'actor identity')
  assertUuid(params.rfqId, 'RFQ identity')

  return db.transaction(async (tx) => {
    const [rfq] = await tx
      .select({
        id: rfqs.id,
        status: rfqs.status,
        line_items: rfqs.line_items,
      })
      .from(rfqs)
      .where(
        and(
          eq(rfqs.id, params.rfqId),
          eq(rfqs.tenant_id, params.tenantId)
        )
      )
      .limit(1)
      .for('update')

    if (!rfq) return { error: 'RFQ not found' }

    let targetStatus: RfqStatus
    let diff: Record<string, unknown>

    if (params.command === 'complete') {
      if (rfq.status === 'completed') {
        return { error: 'RFQ already completed' }
      }
      if (rfq.status === 'cancelled') {
        return { error: 'RFQ is cancelled' }
      }
      if (rfq.status !== 'quotes_received') {
        return { error: 'RFQ quote coverage is incomplete' }
      }

      const quotes = await tx
        .select({
          bom_line_item_id: rfqQuotes.bom_line_item_id,
          material_item_id: rfqQuotes.material_item_id,
          material_code: materialItems.code,
        })
        .from(rfqQuotes)
        .leftJoin(
          materialItems,
          and(
            eq(
              materialItems.id,
              rfqQuotes.material_item_id
            ),
            eq(
              materialItems.tenant_id,
              params.tenantId
            )
          )
        )
        .where(
          and(
            eq(rfqQuotes.rfq_id, params.rfqId),
            eq(rfqQuotes.tenant_id, params.tenantId)
          )
        )

      const lines = parseLineItems(rfq.line_items)
      if (
        lines.length === 0 ||
        !lines.every((line) => lineIsCovered(line, quotes))
      ) {
        return { error: 'RFQ quote coverage is incomplete' }
      }

      targetStatus = 'completed'
      diff = { from: rfq.status, to: targetStatus }
    } else {
      if (rfq.status === 'completed') {
        return { error: 'Cannot cancel a completed RFQ' }
      }
      if (rfq.status === 'cancelled') {
        return { error: 'RFQ already cancelled' }
      }

      targetStatus = 'cancelled'
      diff = {
        from: rfq.status,
        to: targetStatus,
        reason: params.reason,
      }
    }

    const [updated] = await tx
      .update(rfqs)
      .set({
        status: targetStatus,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(rfqs.id, params.rfqId),
          eq(rfqs.tenant_id, params.tenantId),
          eq(rfqs.status, rfq.status)
        )
      )
      .returning({ id: rfqs.id })
    if (!updated) {
      throw new Error('RFQ transition lost its row lock')
    }

    await writeAuditLogInTransaction(tx, {
      tenantId: params.tenantId,
      actorId: params.actorId,
      entityType: 'rfq',
      entityId: params.rfqId,
      action: 'status_change',
      diff,
    })

    return {
      rfqId: params.rfqId,
      tenantId: params.tenantId,
      transitioned: true,
    }
  })
}

export async function notifyRfqCompleted(params: {
  tenantId: string
  rfqId: string
}): Promise<void> {
  await notifyRoles({
    tenantId: params.tenantId,
    recipientRoles: ['commercial'],
    subject: 'RFQ quotes ready for review',
    body: 'Procurement has completed sourcing. Review the comparison and update the BOM.',
    linkUrl: `/procurement/rfqs/${params.rfqId}`,
    payload: {
      event: 'rfq.completed',
      rfq_id: params.rfqId,
    },
  })
}
