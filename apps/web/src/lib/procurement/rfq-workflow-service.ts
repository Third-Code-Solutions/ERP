import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  materialItems,
  rfqQuotes,
  rfqs,
  vendors,
} from '@third-code-erp/database/schema'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
      return {
        quoteId: existing.id,
        created: false,
        statusChanged: false,
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

    return {
      quoteId: created.id,
      created: true,
      statusChanged,
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
