import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  boms,
  materialItems,
  priceHistory,
  rfqQuotes,
  rfqs,
  projects,
  users,
  vendors,
} from '@third-code-erp/database/schema'
import {
  buildRfqBidLevelingResult,
  type RfqBidLevelingResult,
  type RfqBidLevelingSourceLine,
  type RfqBidLevelingSourceQuote,
} from '@third-code-erp/shared-types'
import { ERP_ROLES, roleHasCapability, type ErpCapability } from '@third-code-erp/shared-types/authorization'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

const lineSchema = z
  .object({
    bom_line_item_id: z.string().uuid().optional(),
    material_item_id: z.string().uuid().nullable(),
    code: z.string().trim().max(64).nullable(),
    description: z.string().trim().min(1).max(5000),
    qty: z.number().finite().nonnegative(),
    unit: z.string().trim().max(32).nullable(),
  })
  .strict()

@Injectable()
export class RfqBidLevelingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async read(
    rfqId: string,
    principal: ErpPrincipal,
    now = new Date(),
  ): Promise<RfqBidLevelingResult> {
    await this.requireMembership(principal, 'procurement.rfq_read')
    const [rfq] = await this.database.client
      .select({
        id: rfqs.id,
        status: rfqs.status,
        lineItems: rfqs.line_items,
        projectId: boms.project_id,
      })
      .from(rfqs)
      .innerJoin(
        boms,
        and(eq(boms.id, rfqs.bom_id), eq(boms.tenant_id, principal.tenantId)),
      )
      .innerJoin(
        projects,
        and(eq(projects.id, boms.project_id), eq(projects.tenant_id, principal.tenantId)),
      )
      .where(
        and(
          eq(rfqs.id, rfqId),
          eq(rfqs.tenant_id, principal.tenantId),
          isNull(projects.deleted_at),
        ),
      )
      .limit(1)
    if (!rfq) throw new NotFoundException('RFQ not found')

    const parsedLines = z.array(lineSchema).safeParse(rfq.lineItems)
    if (!parsedLines.success) {
      throw new InternalServerErrorException('RFQ line items are invalid')
    }

    const [quoteRows, awardRows] = await Promise.all([
      this.database.client
        .select({
          quoteId: rfqQuotes.id,
          bomLineItemId: rfqQuotes.bom_line_item_id,
          materialItemId: rfqQuotes.material_item_id,
          materialCode: materialItems.code,
          vendorId: rfqQuotes.vendor_id,
          vendorName: vendors.name,
          unitPriceCents: rfqQuotes.unit_price_cents,
          leadTimeDays: rfqQuotes.lead_time_days,
          validUntil: rfqQuotes.valid_until,
          createdAt: rfqQuotes.created_at,
        })
        .from(rfqQuotes)
        .innerJoin(
          vendors,
          and(eq(vendors.id, rfqQuotes.vendor_id), eq(vendors.tenant_id, principal.tenantId)),
        )
        .leftJoin(
          materialItems,
          and(eq(materialItems.id, rfqQuotes.material_item_id), eq(materialItems.tenant_id, principal.tenantId)),
        )
        .where(and(eq(rfqQuotes.rfq_id, rfqId), eq(rfqQuotes.tenant_id, principal.tenantId))),
      this.database.client
        .select({ quoteId: priceHistory.source_rfq_quote_id })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.tenant_id, principal.tenantId),
            eq(priceHistory.source_rfq_id, rfqId),
            eq(priceHistory.source_type, 'award'),
          ),
        ),
    ])

    const awarded = new Set(
      awardRows.flatMap((row) => row.quoteId ? [row.quoteId] : []),
    )
    const sourceLines: RfqBidLevelingSourceLine[] = parsedLines.data.map((line) => ({
      bomLineItemId: line.bom_line_item_id,
      materialItemId: line.material_item_id,
      code: line.code,
      description: line.description,
      quantity: line.qty,
      unit: line.unit,
    }))
    const sourceQuotes: RfqBidLevelingSourceQuote[] = quoteRows.map((quote) => ({
      quoteId: quote.quoteId,
      bomLineItemId: quote.bomLineItemId,
      materialItemId: quote.materialItemId,
      materialCode: quote.materialCode,
      vendorId: quote.vendorId,
      vendorName: quote.vendorName,
      unitPriceCents: Number(quote.unitPriceCents),
      leadTimeDays: quote.leadTimeDays,
      validUntil: quote.validUntil,
      createdAt: quote.createdAt,
      isAwarded: awarded.has(quote.quoteId),
    }))

    return buildRfqBidLevelingResult(
      rfq.id,
      rfq.projectId,
      rfq.status,
      sourceLines,
      sourceQuotes,
      now,
    )
  }

  private async requireMembership(
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<void> {
    const [membership] = await this.database.client
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId)))
      .limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!role.success || !roleHasCapability(role.data, capability)) throw new ForbiddenException()
  }
}
