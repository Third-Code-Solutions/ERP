import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  materialItems,
  rfqQuotes,
  rfqs,
  vendors,
} from '@third-code-erp/database/schema'
import type {
  LogRfqQuoteCommand,
  RfqQuoteResult,
} from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

interface RfqLineItemJson {
  bom_line_item_id?: string
  material_item_id?: string | null
  description: string
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
        return {
          quoteId: existing.id,
          created: false,
          statusChanged: false,
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

      if (materialItemId) {
        const [material] = await transaction
          .select({ id: materialItems.id })
          .from(materialItems)
          .where(
            and(
              eq(materialItems.id, materialItemId),
              eq(
                materialItems.tenant_id,
                principal.tenantId
              )
            )
          )
          .limit(1)
        if (!material) {
          throw new NotFoundException('Material item not found')
        }
      }

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
        throw new Error('RFQ quote insert returned no record')
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
          throw new Error('RFQ status update lost its row lock')
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

      return {
        quoteId: created.id,
        created: true,
        statusChanged,
      }
    })
  }
}
