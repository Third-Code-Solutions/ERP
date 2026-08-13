import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  materialCatalog,
  materialItems,
  priceHistory,
  rfqQuotes,
  rfqs,
  vendors,
} from '@third-code-erp/database/schema'
import type {
  AwardRfqQuoteCommand,
  CancelRfqCommand,
  CompleteRfqCommand,
  LogRfqQuoteCommand,
  RfqAwardResult,
  RfqTransitionResult,
  RfqQuoteResult,
} from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

interface RfqLineItemJson {
  bom_line_item_id?: string
  material_item_id?: string | null
  code?: string | null
  description: string
  unit?: string | null
}

type RfqTransitionCommand =
  | ({ command: 'complete' } & CompleteRfqCommand)
  | ({ command: 'cancel' } & CancelRfqCommand)

type RfqPriceLine = {
  code: string
  description: string
  unit: string
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

function sameDate(
  left: Date | null,
  right: string | undefined
): boolean {
  return (
    (left?.getTime() ?? null) ===
    (right ? new Date(right).getTime() : null)
  )
}

@Injectable()
export class ProcurementService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(AuditService)
    private readonly audit: AuditService
  ) {}

  private async resolvePriceLine(
    transaction: DatabaseTransaction,
    line: RfqLineItemJson,
    principal: ErpPrincipal
  ): Promise<RfqPriceLine> {
    let code = line.code?.trim() ?? ''
    let description = line.description.trim()
    let unit = line.unit?.trim() ?? ''

    if (line.material_item_id) {
      const [material] = await transaction
        .select({
          code: materialItems.code,
          description: materialItems.description,
          unit: materialItems.unit,
        })
        .from(materialItems)
        .where(
          and(
            eq(materialItems.id, line.material_item_id),
            eq(materialItems.tenant_id, principal.tenantId)
          )
        )
        .limit(1)

      if (!material) throw new NotFoundException('Material item not found')
      code ||= material.code.trim()
      description ||= material.description.trim()
      unit ||= material.unit.trim()
    }

    if (!code) {
      throw new ConflictException(
        'Selected RFQ line needs a material code before price history can be recorded'
      )
    }
    if (!description || !unit) {
      throw new ConflictException(
        'Selected RFQ line is missing catalog description or unit'
      )
    }

    return { code, description, unit }
  }

  private async ensureQuotePriceHistory(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    input: {
      rfqId: string
      quoteId: string
      vendorId: string
      unitPriceCents: number
      line: RfqLineItemJson
    }
  ): Promise<string> {
    const [existingHistory] = await transaction
      .select({ id: priceHistory.id })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.tenant_id, principal.tenantId),
          eq(priceHistory.source_rfq_quote_id, input.quoteId)
        )
      )
      .limit(1)

    if (existingHistory) return existingHistory.id

    const priceLine = await this.resolvePriceLine(
      transaction,
      input.line,
      principal
    )
    const today = new Date().toISOString().slice(0, 10)

    const [catalog] = await transaction
      .select({
        id: materialCatalog.id,
        currentRateCentavos: materialCatalog.current_rate_centavos,
      })
      .from(materialCatalog)
      .where(
        and(
          eq(materialCatalog.tenant_id, principal.tenantId),
          eq(materialCatalog.code, priceLine.code)
        )
      )
      .limit(1)
      .for('update')

    let catalogId = catalog?.id
    const catalogAction = catalogId ? 'update' : 'create'
    if (!catalogId) {
      const [createdCatalog] = await transaction
        .insert(materialCatalog)
        .values({
          tenant_id: principal.tenantId,
          code: priceLine.code,
          description: priceLine.description,
          base_uom: priceLine.unit,
          current_rate_centavos: BigInt(input.unitPriceCents),
          rate_source: 'rfq',
          last_updated_at: new Date(),
          created_by: principal.userId,
          updated_by: principal.userId,
        })
        .onConflictDoNothing({
          target: [materialCatalog.tenant_id, materialCatalog.code],
        })
        .returning({ id: materialCatalog.id })

      catalogId = createdCatalog?.id
      if (!catalogId) {
        const [racedCatalog] = await transaction
          .select({ id: materialCatalog.id })
          .from(materialCatalog)
          .where(
            and(
              eq(materialCatalog.tenant_id, principal.tenantId),
              eq(materialCatalog.code, priceLine.code)
            )
          )
          .limit(1)
          .for('update')
        catalogId = racedCatalog?.id
      }
    }

    if (!catalogId) {
      throw new InternalServerErrorException(
        'Material catalog identity was not created'
      )
    }

    const [updatedCatalog] = await transaction
      .update(materialCatalog)
      .set({
        current_rate_centavos: BigInt(input.unitPriceCents),
        rate_source: 'rfq',
        last_updated_at: new Date(),
        updated_by: principal.userId,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(materialCatalog.id, catalogId),
          eq(materialCatalog.tenant_id, principal.tenantId)
        )
      )
      .returning({ id: materialCatalog.id })

    if (!updatedCatalog) {
      throw new InternalServerErrorException('Material catalog update failed')
    }

    await this.audit.writeSemantic(transaction, {
      tenantId: principal.tenantId,
      actorId: principal.userId,
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

    const [history] = await transaction
      .insert(priceHistory)
      .values({
        tenant_id: principal.tenantId,
        catalog_item_id: catalogId,
        vendor_id: input.vendorId,
        quoted_rate_centavos: BigInt(input.unitPriceCents),
        source_type: 'quote',
        source_document: `rfq:${input.rfqId}`,
        source_rfq_id: input.rfqId,
        source_rfq_quote_id: input.quoteId,
        occurred_at: today,
        created_by: principal.userId,
        updated_by: principal.userId,
      })
      .returning({ id: priceHistory.id })

    if (!history) {
      throw new InternalServerErrorException(
        'RFQ quote price history was not created'
      )
    }

    await this.audit.writeSemantic(transaction, {
      tenantId: principal.tenantId,
      actorId: principal.userId,
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

  async logQuote(
    rfqId: string,
    command: LogRfqQuoteCommand,
    principal: ErpPrincipal
  ): Promise<RfqQuoteResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${
          'rfq_quote_submission:' +
          principal.tenantId +
          ':' +
          command.submissionId
        }, 0))`
      )

      const [rfq] = await transaction
        .select({
          id: rfqs.id,
          status: rfqs.status,
          line_items: rfqs.line_items,
        })
        .from(rfqs)
        .where(
          and(
            eq(rfqs.id, rfqId),
            eq(rfqs.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')

      if (!rfq) throw new NotFoundException('RFQ not found')

      const line = parseLineItems(rfq.line_items).find(
        (item) =>
          item.bom_line_item_id === command.bomLineItemId
      )
      if (!line) {
        throw new NotFoundException('Selected RFQ line is unavailable')
      }

      const materialItemId =
        typeof line.material_item_id === 'string'
          ? line.material_item_id
          : null

      const [existing] = await transaction
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
            eq(rfqQuotes.tenant_id, principal.tenantId),
            eq(rfqQuotes.submission_id, command.submissionId)
          )
        )
        .limit(1)

      if (existing) {
        const exact =
          existing.rfq_id === rfqId &&
          existing.bom_line_item_id ===
            command.bomLineItemId &&
          existing.vendor_id === command.vendorId &&
          existing.material_item_id === materialItemId &&
          existing.unit_price_cents ===
            command.unitPriceCents &&
          existing.lead_time_days ===
            (command.leadTimeDays ?? null) &&
          sameDate(existing.valid_until, command.validUntil) &&
          existing.notes === (command.notes ?? null)
        if (!exact) {
          throw new ConflictException('Quote submission conflict')
        }
        const priceHistoryId = await this.ensureQuotePriceHistory(
          transaction,
          principal,
          {
            rfqId,
            quoteId: existing.id,
            vendorId: existing.vendor_id,
            unitPriceCents: existing.unit_price_cents,
            line,
          }
        )
        return {
          quoteId: existing.id,
          created: false,
          statusChanged: false,
          priceHistoryId,
        }
      }

      if (
        rfq.status === 'completed' ||
        rfq.status === 'cancelled'
      ) {
        throw new ConflictException(
          `Cannot log quotes on a ${rfq.status} RFQ`
        )
      }

      const [vendor] = await transaction
        .select({ id: vendors.id })
        .from(vendors)
        .where(
          and(
            eq(vendors.id, command.vendorId),
            eq(vendors.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
      if (!vendor) throw new NotFoundException('Vendor not found')

      await this.resolvePriceLine(transaction, line, principal)

      const validUntil = command.validUntil
        ? new Date(command.validUntil)
        : undefined
      const [created] = await transaction
        .insert(rfqQuotes)
        .values({
          tenant_id: principal.tenantId,
          submission_id: command.submissionId,
          rfq_id: rfqId,
          bom_line_item_id: command.bomLineItemId,
          vendor_id: command.vendorId,
          material_item_id: materialItemId,
          unit_price_cents: command.unitPriceCents,
          lead_time_days: command.leadTimeDays,
          valid_until: validUntil,
          notes: command.notes,
          created_by: principal.userId,
        })
        .returning({ id: rfqQuotes.id })

      if (!created) {
        throw new InternalServerErrorException(
          'RFQ quote insert returned no record'
        )
      }

      const statusChanged = rfq.status === 'pending'
      if (statusChanged) {
        const [updated] = await transaction
          .update(rfqs)
          .set({
            status: 'quotes_received',
            updated_at: new Date(),
          })
          .where(
            and(
              eq(rfqs.id, rfqId),
              eq(rfqs.tenant_id, principal.tenantId),
              eq(rfqs.status, 'pending')
            )
          )
          .returning({ id: rfqs.id })
        if (!updated) {
          throw new InternalServerErrorException(
            'RFQ status update lost its row lock'
          )
        }
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        entityType: 'rfq_quote',
        entityId: created.id,
        action: 'create',
        diff: {
          rfq_id: rfqId,
          bom_line_item_id: command.bomLineItemId,
          vendor_id: command.vendorId,
          unit_price_cents: command.unitPriceCents,
          submission_id: command.submissionId,
        },
      })

      if (statusChanged) {
        await this.audit.writeSemantic(transaction, {
          tenantId: principal.tenantId,
          actorId: principal.userId,
          entityType: 'rfq',
          entityId: rfqId,
          action: 'status_change',
          diff: {
            from: 'pending',
            to: 'quotes_received',
            source: 'first_quote',
          },
        })
      }

      const priceHistoryId = await this.ensureQuotePriceHistory(
        transaction,
        principal,
        {
          rfqId,
          quoteId: created.id,
          vendorId: command.vendorId,
          unitPriceCents: command.unitPriceCents,
          line,
        }
      )

      return {
        quoteId: created.id,
        created: true,
        statusChanged,
        priceHistoryId,
      }
    })
  }

  async awardQuote(
    rfqId: string,
    quoteId: string,
    _command: AwardRfqQuoteCommand,
    principal: ErpPrincipal
  ): Promise<RfqAwardResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)

      const [rfq] = await transaction
        .select({
          id: rfqs.id,
          status: rfqs.status,
          line_items: rfqs.line_items,
        })
        .from(rfqs)
        .where(
          and(
            eq(rfqs.id, rfqId),
            eq(rfqs.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')

      if (!rfq) throw new NotFoundException('RFQ not found')
      if (rfq.status === 'cancelled') {
        throw new ConflictException('Cannot award a cancelled RFQ')
      }
      if (rfq.status !== 'completed') {
        throw new ConflictException(
          'RFQ must be completed before a quote can be awarded'
        )
      }

      const [quote] = await transaction
        .select({
          id: rfqQuotes.id,
          rfq_id: rfqQuotes.rfq_id,
          bom_line_item_id: rfqQuotes.bom_line_item_id,
          vendor_id: rfqQuotes.vendor_id,
          material_item_id: rfqQuotes.material_item_id,
          unit_price_cents: rfqQuotes.unit_price_cents,
        })
        .from(rfqQuotes)
        .where(
          and(
            eq(rfqQuotes.id, quoteId),
            eq(rfqQuotes.rfq_id, rfqId),
            eq(rfqQuotes.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')

      if (!quote) throw new NotFoundException('RFQ quote not found')

      const line = parseLineItems(rfq.line_items).find(
        (item) => item.bom_line_item_id === quote.bom_line_item_id
      )
      if (!line) {
        throw new NotFoundException('Selected RFQ line is unavailable')
      }

      const [existingHistory] = await transaction
        .select({
          id: priceHistory.id,
          awardedRateCentavos: priceHistory.awarded_rate_centavos,
        })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.tenant_id, principal.tenantId),
            eq(priceHistory.source_rfq_quote_id, quote.id)
          )
        )
        .limit(1)
        .for('update')

      if (existingHistory?.awardedRateCentavos != null) {
        return {
          rfqId,
          quoteId,
          tenantId: principal.tenantId,
          priceHistoryId: existingHistory.id,
          awarded: true,
        }
      }

      const [otherAward] = quote.bom_line_item_id
        ? await transaction
            .select({ id: priceHistory.id })
            .from(priceHistory)
            .innerJoin(
              rfqQuotes,
              and(
                eq(
                  priceHistory.source_rfq_quote_id,
                  rfqQuotes.id
                ),
                eq(rfqQuotes.tenant_id, principal.tenantId)
              )
            )
            .where(
              and(
                eq(priceHistory.tenant_id, principal.tenantId),
                eq(priceHistory.source_rfq_id, rfqId),
                eq(priceHistory.source_type, 'award'),
                eq(rfqQuotes.bom_line_item_id, quote.bom_line_item_id)
              )
            )
            .limit(1)
        : []

      if (otherAward) {
        throw new ConflictException(
          'A quote is already awarded for this RFQ line'
        )
      }

      const priceHistoryId = existingHistory?.id ??
        await this.ensureQuotePriceHistory(
          transaction,
          principal,
          {
            rfqId,
            quoteId: quote.id,
            vendorId: quote.vendor_id,
            unitPriceCents: quote.unit_price_cents,
            line,
          }
        )

      const [updatedHistory] = await transaction
        .update(priceHistory)
        .set({
          awarded_rate_centavos: BigInt(quote.unit_price_cents),
          source_type: 'award',
          updated_by: principal.userId,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(priceHistory.id, priceHistoryId),
            eq(priceHistory.tenant_id, principal.tenantId)
          )
        )
        .returning({ id: priceHistory.id })

      if (!updatedHistory) {
        throw new InternalServerErrorException(
          'RFQ award price history update failed'
        )
      }

      const [catalog] = await transaction
        .select({ id: priceHistory.catalog_item_id })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.id, priceHistoryId),
            eq(priceHistory.tenant_id, principal.tenantId)
          )
        )
        .limit(1)

      if (!catalog) {
        throw new InternalServerErrorException('Award catalog identity is missing')
      }

      const [updatedCatalog] = await transaction
        .update(materialCatalog)
        .set({
          current_rate_centavos: BigInt(quote.unit_price_cents),
          rate_source: 'rfq',
          last_updated_at: new Date(),
          updated_by: principal.userId,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(materialCatalog.id, catalog.id),
            eq(materialCatalog.tenant_id, principal.tenantId)
          )
        )
        .returning({ id: materialCatalog.id })

      if (!updatedCatalog) {
        throw new InternalServerErrorException('Award catalog update failed')
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        entityType: 'price_history',
        entityId: priceHistoryId,
        action: 'update',
        diff: {
          source_type: 'award',
          source_rfq_id: rfqId,
          source_rfq_quote_id: quoteId,
          awarded_rate_centavos: quote.unit_price_cents,
        },
      })
      await this.audit.writeSemantic(transaction, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        entityType: 'material_catalog',
        entityId: catalog.id,
        action: 'update',
        diff: {
          source_type: 'award',
          source_rfq_id: rfqId,
          source_rfq_quote_id: quoteId,
          current_rate_centavos: quote.unit_price_cents,
        },
      })

      return {
        rfqId,
        quoteId,
        tenantId: principal.tenantId,
        priceHistoryId,
        awarded: true,
      }
    })
  }

  async transitionRfq(
    rfqId: string,
    command: RfqTransitionCommand,
    principal: ErpPrincipal
  ): Promise<RfqTransitionResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)

      const [rfq] = await transaction
        .select({
          id: rfqs.id,
          status: rfqs.status,
          line_items: rfqs.line_items,
        })
        .from(rfqs)
        .where(
          and(
            eq(rfqs.id, rfqId),
            eq(rfqs.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')

      if (!rfq) throw new NotFoundException('RFQ not found')

      let targetStatus: 'completed' | 'cancelled'
      let diff: Record<string, unknown>

      if (command.command === 'complete') {
        if (rfq.status === 'completed') {
          throw new ConflictException('RFQ already completed')
        }
        if (rfq.status === 'cancelled') {
          throw new ConflictException('RFQ is cancelled')
        }
        if (rfq.status !== 'quotes_received') {
          throw new ConflictException(
            'RFQ quote coverage is incomplete'
          )
        }

        const quotes = await transaction
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
                principal.tenantId
              )
            )
          )
          .where(
            and(
              eq(rfqQuotes.rfq_id, rfqId),
              eq(rfqQuotes.tenant_id, principal.tenantId)
            )
          )

        const lines = parseLineItems(rfq.line_items)
        if (
          lines.length === 0 ||
          !lines.every((line) => lineIsCovered(line, quotes))
        ) {
          throw new ConflictException(
            'RFQ quote coverage is incomplete'
          )
        }

        targetStatus = 'completed'
        diff = { from: rfq.status, to: targetStatus }
      } else {
        if (rfq.status === 'completed') {
          throw new ConflictException(
            'Cannot cancel a completed RFQ'
          )
        }
        if (rfq.status === 'cancelled') {
          throw new ConflictException('RFQ already cancelled')
        }

        targetStatus = 'cancelled'
        diff = {
          from: rfq.status,
          to: targetStatus,
          reason: command.reason,
        }
      }

      const [updated] = await transaction
        .update(rfqs)
        .set({
          status: targetStatus,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(rfqs.id, rfqId),
            eq(rfqs.tenant_id, principal.tenantId),
            eq(rfqs.status, rfq.status)
          )
        )
        .returning({ id: rfqs.id })

      if (!updated) {
        throw new ConflictException(
          'RFQ transition lost its row lock'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        entityType: 'rfq',
        entityId: rfqId,
        action: 'status_change',
        diff,
      })

      return {
        rfqId,
        tenantId: principal.tenantId,
        transitioned: true,
      }
    })
  }
}
