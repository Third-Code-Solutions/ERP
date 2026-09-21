import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  exchangeRates,
  bankStatements,
  cashAllocations,
  cashTransactions,
  fiscalPeriodCloseRuns,
  fiscalPeriods,
  inventoryReservationEvents,
  inventoryReservations,
  landedCostAllocations,
  landedCostDocuments,
  landedCostLines,
  journalEntries,
  materialItems,
  poLineItems,
  priceListItems,
  priceLists,
  procurementRequisitionEvents,
  procurementRequisitionLines,
  procurementRequisitions,
  projects,
  providerDeliveryOutbox,
  purchaseOrders,
  rfqQuotes,
  sapPostingOutbox,
  roadmapWorkflowEvents,
  statutoryOutputs,
  stockLedgerEntries,
  stockReceiptLines,
  stockReceipts,
  supplierBills,
  tenantCurrencies,
  tenantFeatureFlags,
  taxProfiles,
  users,
  warehouses,
} from '@third-code-erp/database/schema'
import {
  allocateProRata,
  availableInventory,
  activatePriceListCommandSchema,
  calculateTaxByProfileCommandSchema,
  calculateTax,
  calculateTaxResultSchema,
  closeStatus,
  convertMinorUnits,
  createExchangeRateCommandSchema,
  createProcurementRequisitionCommandSchema,
  applyLandedCostCommandSchema,
  createPriceListCommandSchema,
  createTaxProfileCommandSchema,
  exchangeRateResultSchema,
  generateStatutoryOutputCommandSchema,
  fiscalPeriodCloseResultSchema,
  fiscalPeriodCloseCommandSchema,
  inventoryReservationWorkflowCommandSchema,
  inventoryReservationResultSchema,
  priceResolutionQuerySchema,
  priceResolutionResultSchema,
  priceListResultSchema,
  procurementTraceResultSchema,
  providerDeliveryRequestSchema,
  providerDeliveryResultSchema,
  procurementRequisitionResultSchema,
  procurementRequisitionWorkflowCommandSchema,
  reserveInventoryCommandSchema,
  resolvePriceCandidate,
  sapPostingRequestSchema,
  sapPostingResultSchema,
  statutoryOutputResultSchema,
  taxProfileResultSchema,
  taxProfileWorkflowCommandSchema,
  tenantCurrencyCommandSchema,
  tenantCurrencyResultSchema,
  calculateTaxCommandSchema,
  type ApplyLandedCostCommand,
  type ActivatePriceListCommand,
  type CreateProcurementRequisitionCommand,
  type CreateExchangeRateCommand,
  type CreatePriceListCommand,
  type CreateTaxProfileCommand,
  type TaxProfileWorkflowCommand,
  type TenantCurrencyCommand,
  type FiscalPeriodCloseCommand,
  type InventoryReservationWorkflowCommand,
  type PriceResolutionQuery,
  type ProviderDeliveryRequest,
  type ProcurementRequisitionWorkflowCommand,
  type ReserveInventoryCommand,
  type SapPostingRequest,
} from '@third-code-erp/shared-types'
import { and, asc, desc, eq, gte, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n
const MICROS_PER_UNIT = 1_000_000n

type RoadmapFeature =
  | 'procurement_lifecycle'
  | 'stock_reservations'
  | 'landed_cost'
  | 'price_lists'
  | 'tax_statutory_outputs'
  | 'multi_currency'
  | 'period_close'
  | 'sap_posting'
  | 'provider_delivery'

function commandHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function requireIdempotency(raw: string | undefined): string {
  const value = raw?.trim() ?? ''
  if (!value || value.length > 256) {
    throw new BadRequestException('A non-empty Idempotency-Key up to 256 characters is required')
  }
  return value
}

function safeDbInteger(value: bigint, label: string): number {
  if (value < -MAX_POSTGRES_BIGINT || value > MAX_POSTGRES_BIGINT) {
    throw new ConflictException(`${label} exceeds PostgreSQL bigint range`)
  }
  if (value < -MAX_SAFE_INTEGER_BIGINT || value > MAX_SAFE_INTEGER_BIGINT) {
    throw new ConflictException(`${label} exceeds supported exact integer range`)
  }
  return Number(value)
}

function asBigInt(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n
  return BigInt(value)
}

function periodDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value
}

function statusAsString(value: string): 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'converted' | 'cancelled' {
  if (['draft', 'pending_approval', 'approved', 'rejected', 'converted', 'cancelled'].includes(value)) {
    return value as 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'converted' | 'cancelled'
  }
  throw new InternalServerErrorException('Stored requisition status is invalid')
}

function reservationStatus(value: string): 'active' | 'released' | 'consumed' | 'expired' {
  if (['active', 'released', 'consumed', 'expired'].includes(value)) {
    return value as 'active' | 'released' | 'consumed' | 'expired'
  }
  throw new InternalServerErrorException('Stored reservation status is invalid')
}

function envFeatureKey(feature: RoadmapFeature): string {
  return `ERP_ROADMAP_${feature.toUpperCase()}_ENABLED`
}

@Injectable()
export class RoadmapService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async requireFeature(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    feature: RoadmapFeature,
  ): Promise<void> {
    const envValue = this.config.get<unknown>(envFeatureKey(feature))
    const envEnabled = envValue === true || envValue === 'true'
    if (envEnabled) return

    const [flag] = await transaction
      .select({ enabled: tenantFeatureFlags.enabled })
      .from(tenantFeatureFlags)
      .where(
        and(
          eq(tenantFeatureFlags.tenant_id, principal.tenantId),
          eq(tenantFeatureFlags.feature_key, feature),
          eq(tenantFeatureFlags.enabled, true),
        ),
      )
      .limit(1)
    if (!flag?.enabled) {
      throw new ServiceUnavailableException(
        `Roadmap feature ${feature} is disabled for this tenant; no change was committed.`,
      )
    }
  }

  private async assertPrincipal(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
  ): Promise<void> {
    const [user] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId)))
      .limit(1)
      .for('share')
    if (!user) throw new ForbiddenException('Authenticated user is not in this tenant')
  }

  private async lockTenant(transaction: DatabaseTransaction, tenantId: string): Promise<void> {
    await transaction.execute(sql`
      select pg_advisory_xact_lock(hashtextextended(${`roadmap:${tenantId}`}, 0))
    `)
  }

  private async workflowReplay(
    transaction: DatabaseTransaction,
    tenantId: string,
    idempotencyKey: string,
  ) {
    const [event] = await transaction
      .select()
      .from(roadmapWorkflowEvents)
      .where(
        and(
          eq(roadmapWorkflowEvents.tenant_id, tenantId),
          eq(roadmapWorkflowEvents.idempotency_key, idempotencyKey),
        ),
      )
      .limit(1)
    return event
  }

  private async recordWorkflowEvent(
    transaction: DatabaseTransaction,
    input: {
      tenantId: string
      entityType: string
      entityId: string
      action: string
      fromStatus: string | null
      toStatus: string | null
      payload: Record<string, unknown>
      actorId: string
      idempotencyKey: string
    },
  ): Promise<void> {
    await transaction.insert(roadmapWorkflowEvents).values({
      tenant_id: input.tenantId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      payload: input.payload,
      actor_id: input.actorId,
      idempotency_key: input.idempotencyKey,
    })
  }

  async createRequisition(
    input: CreateProcurementRequisitionCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
  ) {
    const command = createProcurementRequisitionCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'procurement_lifecycle')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)

      const requestHash = commandHash(command)
      const [existingEvent] = await transaction
        .select({ requisitionId: procurementRequisitionEvents.requisition_id })
        .from(procurementRequisitionEvents)
        .where(
          and(
            eq(procurementRequisitionEvents.tenant_id, principal.tenantId),
            eq(procurementRequisitionEvents.idempotency_key, idempotencyKey),
          ),
        )
        .limit(1)
      if (existingEvent) {
        const [existing] = await transaction
          .select()
          .from(procurementRequisitions)
          .where(
            and(
              eq(procurementRequisitions.id, existingEvent.requisitionId),
              eq(procurementRequisitions.tenant_id, principal.tenantId),
            ),
          )
          .limit(1)
        if (!existing) throw new InternalServerErrorException('Requisition idempotency target is missing')
        return this.requisitionResult(transaction, existing, false)
      }

      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, command.projectId), eq(projects.tenant_id, principal.tenantId), isNull(projects.deleted_at)))
        .limit(1)
      if (!project) throw new NotFoundException('Project not found in this tenant')

      const total = command.lines.reduce(
        (sum, line) => sum + (BigInt(line.quantityMicros) * BigInt(line.estimatedUnitCostCents)) / MICROS_PER_UNIT,
        0n,
      )
      const [countRow] = await transaction
        .select({ count: sql<string>`count(*)::text` })
        .from(procurementRequisitions)
        .where(eq(procurementRequisitions.tenant_id, principal.tenantId))
      const requisitionNumber = `REQ-${(BigInt(countRow?.count ?? '0') + 1n).toString().padStart(5, '0')}`
      const [requisition] = await transaction
        .insert(procurementRequisitions)
        .values({
          tenant_id: principal.tenantId,
          project_id: command.projectId,
          requester_id: principal.userId,
          requisition_number: requisitionNumber,
          status: 'draft',
          needed_by: command.neededBy ?? null,
          purpose: command.purpose,
          currency: command.currency,
          estimated_total_cents: total,
        })
        .returning()
      if (!requisition) throw new InternalServerErrorException('Requisition was not created')

      await transaction.insert(procurementRequisitionLines).values(
        command.lines.map((line, index) => ({
          tenant_id: principal.tenantId,
          requisition_id: requisition.id,
          line_number: index + 1,
          description: line.description,
          material_item_id: line.materialItemId ?? null,
          bom_line_item_id: line.bomLineItemId ?? null,
          cost_code_id: line.costCodeId ?? null,
          uom_id: line.uomId ?? null,
          quantity_micros: BigInt(line.quantityMicros),
          estimated_unit_cost_cents: BigInt(line.estimatedUnitCostCents),
          estimated_total_cents: (BigInt(line.quantityMicros) * BigInt(line.estimatedUnitCostCents)) / MICROS_PER_UNIT,
        })),
      )
      await transaction.insert(procurementRequisitionEvents).values({
        tenant_id: principal.tenantId,
        requisition_id: requisition.id,
        action: 'create',
        from_status: null,
        to_status: 'draft',
        reason: `request_hash:${requestHash}`,
        actor_id: principal.userId,
        idempotency_key: idempotencyKey,
      })
      await this.audit.writeSemantic(transaction, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        entityType: 'procurement_requisition',
        entityId: requisition.id,
        action: 'create',
        diff: { requisitionNumber, lineCount: command.lines.length, estimatedTotalCents: total.toString() },
      })
      return this.requisitionResult(transaction, requisition, true)
    })
  }

  async transitionRequisition(
    requisitionId: string,
    input: ProcurementRequisitionWorkflowCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
  ) {
    const command = procurementRequisitionWorkflowCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'procurement_lifecycle')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)

      const [priorEvent] = await transaction
        .select({ requisitionId: procurementRequisitionEvents.requisition_id })
        .from(procurementRequisitionEvents)
        .where(and(eq(procurementRequisitionEvents.tenant_id, principal.tenantId), eq(procurementRequisitionEvents.idempotency_key, idempotencyKey)))
        .limit(1)
      if (priorEvent) {
        const [replayed] = await transaction.select().from(procurementRequisitions).where(and(eq(procurementRequisitions.id, priorEvent.requisitionId), eq(procurementRequisitions.tenant_id, principal.tenantId))).limit(1)
        if (!replayed) throw new InternalServerErrorException('Requisition workflow replay target is missing')
        return this.requisitionResult(transaction, replayed, false)
      }

      const [requisition] = await transaction
        .select()
        .from(procurementRequisitions)
        .where(and(eq(procurementRequisitions.id, requisitionId), eq(procurementRequisitions.tenant_id, principal.tenantId)))
        .limit(1)
        .for('update')
      if (!requisition) throw new NotFoundException('Requisition not found')
      const current = statusAsString(requisition.status)
      const next = this.nextRequisitionStatus(command.action, current)
      if (command.action === 'reject' && !(command.reason?.trim())) throw new BadRequestException('Rejection reason is required')
      let convertedPurchaseOrderId: string | null = null
      if (command.action === 'convert_to_po') {
        if (!roleHasCapability(principal.role, 'po.create')) throw new ForbiddenException('PO creation capability is required')
        convertedPurchaseOrderId = await this.convertRequisitionToPurchaseOrder(transaction, requisition, command.selectedQuoteIds ?? [], principal)
      }
      const [updated] = await transaction
        .update(procurementRequisitions)
        .set({
          status: next,
          approved_by: command.action === 'approve' ? principal.userId : requisition.approved_by,
          approved_at: command.action === 'approve' ? new Date() : requisition.approved_at,
          converted_purchase_order_id: convertedPurchaseOrderId ?? requisition.converted_purchase_order_id,
          updated_at: new Date(),
        })
        .where(and(eq(procurementRequisitions.id, requisition.id), eq(procurementRequisitions.tenant_id, principal.tenantId)))
        .returning()
      if (!updated) throw new InternalServerErrorException('Requisition workflow update failed')
      await transaction.insert(procurementRequisitionEvents).values({
        tenant_id: principal.tenantId,
        requisition_id: requisition.id,
        action: command.action,
        from_status: current,
        to_status: next,
        reason: command.reason ?? null,
        actor_id: principal.userId,
        idempotency_key: idempotencyKey,
      })
      await this.audit.writeSemantic(transaction, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        entityType: 'procurement_requisition',
        entityId: requisition.id,
        action: command.action === 'approve' ? 'approve' : 'status_change',
        diff: { from: current, to: next, reason: command.reason ?? null, purchaseOrderId: convertedPurchaseOrderId },
      })
      return this.requisitionResult(transaction, updated, true)
    })
  }

  async getProcurementTrace(requisitionId: string, principal: ErpPrincipal) {
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'procurement_lifecycle')
      await this.assertPrincipal(transaction, principal)
      const [requisition] = await transaction
        .select()
        .from(procurementRequisitions)
        .where(and(eq(procurementRequisitions.id, requisitionId), eq(procurementRequisitions.tenant_id, principal.tenantId)))
        .limit(1)
      if (!requisition) throw new NotFoundException('Requisition not found')

      const [purchaseOrder] = requisition.converted_purchase_order_id
        ? await transaction
            .select({ id: purchaseOrders.id, poNumber: purchaseOrders.po_number, status: purchaseOrders.status })
            .from(purchaseOrders)
            .where(and(eq(purchaseOrders.id, requisition.converted_purchase_order_id), eq(purchaseOrders.tenant_id, principal.tenantId)))
            .limit(1)
        : []
      const receipts = purchaseOrder
        ? await transaction
            .select({ id: stockReceipts.id, internalNumber: stockReceipts.internal_number, status: stockReceipts.status })
            .from(stockReceipts)
            .where(and(eq(stockReceipts.tenant_id, principal.tenantId), eq(stockReceipts.purchase_order_id, purchaseOrder.id)))
            .orderBy(asc(stockReceipts.received_date))
        : []
      const bills = purchaseOrder
        ? await transaction
            .select({ id: supplierBills.id, vendorBillNumber: supplierBills.vendor_bill_number, status: supplierBills.status, totalPayableCents: supplierBills.total_payable_cents })
            .from(supplierBills)
            .where(and(eq(supplierBills.tenant_id, principal.tenantId), eq(supplierBills.purchase_order_id, purchaseOrder.id)))
            .orderBy(asc(supplierBills.bill_date))
        : []
      const billIds = bills.map((bill) => bill.id)
      const payments = billIds.length === 0
        ? []
        : await transaction
            .select({ id: cashTransactions.id, status: cashTransactions.status, amountCents: cashAllocations.amount_cents, currency: cashTransactions.currency })
            .from(cashAllocations)
            .innerJoin(cashTransactions, and(eq(cashTransactions.id, cashAllocations.cash_transaction_id), eq(cashTransactions.tenant_id, principal.tenantId)))
            .where(and(eq(cashAllocations.tenant_id, principal.tenantId), eq(cashAllocations.allocation_type, 'supplier_bill'), inArray(cashAllocations.supplier_bill_id, billIds)))
            .orderBy(asc(cashTransactions.transaction_date))
      return procurementTraceResultSchema.parse({
        requisitionId: requisition.id,
        tenantId: requisition.tenant_id,
        requisitionNumber: requisition.requisition_number,
        requisitionStatus: requisition.status,
        purchaseOrder: purchaseOrder ? { id: purchaseOrder.id, poNumber: purchaseOrder.poNumber, status: purchaseOrder.status } : null,
        receipts: receipts.map((receipt) => ({ id: receipt.id, internalNumber: receipt.internalNumber, status: receipt.status })),
        bills: bills.map((bill) => ({ id: bill.id, vendorBillNumber: bill.vendorBillNumber, status: bill.status, totalPayableCents: String(bill.totalPayableCents) })),
        payments: payments.map((payment) => ({ id: payment.id, status: payment.status, amountCents: String(payment.amountCents), currency: payment.currency })),
      })
    })
  }

  private nextRequisitionStatus(action: ProcurementRequisitionWorkflowCommand['action'], current: ReturnType<typeof statusAsString>): ReturnType<typeof statusAsString> {
    if (action === 'submit' && current === 'draft') return 'pending_approval'
    if (action === 'approve' && current === 'pending_approval') return 'approved'
    if (action === 'reject' && current === 'pending_approval') return 'rejected'
    if (action === 'cancel' && ['draft', 'pending_approval', 'rejected'].includes(current)) return 'cancelled'
    if (action === 'convert_to_po' && current === 'approved') return 'converted'
    throw new ConflictException(`Requisition cannot perform ${action} from status ${current}`)
  }

  private async requisitionResult(
    transaction: DatabaseTransaction,
    value: typeof procurementRequisitions.$inferSelect,
    created: boolean,
  ) {
    const [lineCount] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(procurementRequisitionLines)
      .where(
        and(
          eq(procurementRequisitionLines.tenant_id, value.tenant_id),
          eq(procurementRequisitionLines.requisition_id, value.id),
        ),
      )
    return procurementRequisitionResultSchema.parse({
      requisitionId: value.id,
      tenantId: value.tenant_id,
      requisitionNumber: value.requisition_number,
      status: value.status,
      estimatedTotalCents: String(value.estimated_total_cents),
      lineCount: lineCount?.count ?? 0,
      created,
    })
  }

  private async convertRequisitionToPurchaseOrder(
    transaction: DatabaseTransaction,
    requisition: typeof procurementRequisitions.$inferSelect,
    selectedQuoteIds: readonly string[],
    principal: ErpPrincipal,
  ): Promise<string> {
    const lines = await transaction
      .select()
      .from(procurementRequisitionLines)
      .where(and(eq(procurementRequisitionLines.tenant_id, principal.tenantId), eq(procurementRequisitionLines.requisition_id, requisition.id)))
      .orderBy(asc(procurementRequisitionLines.line_number))
    if (lines.length === 0) throw new ConflictException('Cannot convert a requisition without lines')
    if (selectedQuoteIds.length !== lines.length) throw new ConflictException('One selected quote is required per requisition line')
    const quotes = await transaction
      .select()
      .from(rfqQuotes)
      .where(and(eq(rfqQuotes.tenant_id, principal.tenantId), inArray(rfqQuotes.id, selectedQuoteIds)))
    if (quotes.length !== selectedQuoteIds.length) throw new ConflictException('Every selected quote must belong to this tenant')
    const quoteById = new Map(quotes.map((quote) => [quote.id, quote]))
    const selected = selectedQuoteIds.map((id) => quoteById.get(id))
    if (selected.some((quote) => !quote)) throw new ConflictException('Selected quote is missing')
    const vendorId = selected[0]!.vendor_id
    if (selected.some((quote) => quote!.vendor_id !== vendorId)) throw new ConflictException('All selected quotes must use the same vendor')
    const [countRow] = await transaction.select({ count: sql<string>`count(*)::text` }).from(purchaseOrders).where(eq(purchaseOrders.tenant_id, principal.tenantId))
    const poNumber = `PO-${(BigInt(countRow?.count ?? '0') + 1n).toString().padStart(5, '0')}`
    const totals = lines.map((line, index) => {
      const quote = selected[index]!
      if (line.material_item_id && quote.material_item_id && line.material_item_id !== quote.material_item_id) throw new ConflictException('Selected quote material does not match the requisition line')
      const quantity = asBigInt(line.quantity_micros)
      const unit = BigInt(quote.unit_price_cents)
      const lineTotal = (quantity * unit) / MICROS_PER_UNIT
      return { line, quote, quantity, unit, lineTotal }
    })
    const subtotal = totals.reduce((sum, value) => sum + value.lineTotal, 0n)
    const vat = (subtotal * 1_200n + 5_000n) / 10_000n
    const withholding = (subtotal * 200n + 5_000n) / 10_000n
    const [po] = await transaction.insert(purchaseOrders).values({
      tenant_id: principal.tenantId,
      project_id: requisition.project_id,
      vendor_id: vendorId,
      created_by: principal.userId,
      po_number: poNumber,
      status: 'draft',
      subtotal_cents: safeDbInteger(subtotal, 'Purchase Order subtotal'),
      vat_cents: safeDbInteger(vat, 'Purchase Order VAT'),
      withholding_tax_cents: safeDbInteger(withholding, 'Purchase Order withholding tax'),
      total_cents: safeDbInteger(subtotal + vat - withholding, 'Purchase Order total'),
    }).returning({ id: purchaseOrders.id })
    if (!po) throw new InternalServerErrorException('Purchase Order was not created')
    await transaction.insert(poLineItems).values(totals.map(({ line, quantity, unit, lineTotal }, index) => ({
      tenant_id: principal.tenantId,
      po_id: po.id,
      sort_order: index,
      description: line.description,
      material_item_id: line.material_item_id,
      bom_line_item_id: line.bom_line_item_id,
      cost_code_id: line.cost_code_id,
      uom_id: line.uom_id,
      quantity: safeDbInteger(quantity / MICROS_PER_UNIT, 'Purchase Order quantity'),
      quantity_micros: safeDbInteger(quantity, 'Purchase Order quantity micros'),
      unit_cost_cents: safeDbInteger(unit, 'Purchase Order unit cost'),
      line_total_cents: safeDbInteger(lineTotal, 'Purchase Order line total'),
    })))
    return po.id
  }

  async reserveInventory(
    input: ReserveInventoryCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
  ) {
    const command = reserveInventoryCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'stock_reservations')
      await this.assertPrincipal(transaction, principal)
      await this.lockInventory(transaction, principal.tenantId, command.warehouseId, command.materialItemId)
      await this.audit.stampActor(transaction, principal)
      const [existing] = await transaction.select().from(inventoryReservations).where(and(eq(inventoryReservations.tenant_id, principal.tenantId), eq(inventoryReservations.idempotency_key, idempotencyKey))).limit(1)
      if (existing) return this.reservationResult(existing, false, await this.availableQuantity(transaction, principal.tenantId, command.warehouseId, command.materialItemId, command.uomId))
      const [warehouse] = await transaction.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.id, command.warehouseId), eq(warehouses.tenant_id, principal.tenantId), eq(warehouses.is_active, true))).limit(1)
      if (!warehouse) throw new NotFoundException('Warehouse not found in this tenant')
      const [item] = await transaction.select({ id: materialItems.id }).from(materialItems).where(and(eq(materialItems.id, command.materialItemId), eq(materialItems.tenant_id, principal.tenantId), eq(materialItems.is_active, true))).limit(1)
      if (!item) throw new NotFoundException('Material item not found in this tenant')
      const available = await this.availableQuantity(transaction, principal.tenantId, command.warehouseId, command.materialItemId, command.uomId)
      const requested = BigInt(command.quantityMicros)
      if (requested > available) throw new ConflictException(`Insufficient available inventory; requested ${requested}, available ${available}`)
      const [reservation] = await transaction.insert(inventoryReservations).values({
        tenant_id: principal.tenantId,
        warehouse_id: command.warehouseId,
        material_item_id: command.materialItemId,
        uom_id: command.uomId,
        project_id: command.projectId ?? null,
        cost_code_id: command.costCodeId ?? null,
        po_line_item_id: command.poLineItemId ?? null,
        quantity_micros: requested,
        status: 'active',
        source_type: command.sourceType,
        source_id: command.sourceId ?? null,
        expires_at: command.expiresAt ? new Date(command.expiresAt) : null,
        requested_by: principal.userId,
        idempotency_key: idempotencyKey,
      }).returning()
      if (!reservation) throw new InternalServerErrorException('Inventory reservation was not created')
      await transaction.insert(inventoryReservationEvents).values({ tenant_id: principal.tenantId, reservation_id: reservation.id, action: 'create', quantity_micros: requested, actor_id: principal.userId, reason: null, idempotency_key: idempotencyKey })
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'inventory_reservation', entityId: reservation.id, action: 'create', diff: { quantityMicros: requested.toString(), availableAfterMicros: (available - requested).toString() } })
      return this.reservationResult(reservation, true, available - requested)
    })
  }

  async transitionReservation(
    reservationId: string,
    input: InventoryReservationWorkflowCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
  ) {
    const command = inventoryReservationWorkflowCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'stock_reservations')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const [event] = await transaction.select({ reservationId: inventoryReservationEvents.reservation_id }).from(inventoryReservationEvents).where(and(eq(inventoryReservationEvents.tenant_id, principal.tenantId), eq(inventoryReservationEvents.idempotency_key, idempotencyKey))).limit(1)
      const targetId = event?.reservationId ?? reservationId
      const [reservation] = await transaction.select().from(inventoryReservations).where(and(eq(inventoryReservations.id, targetId), eq(inventoryReservations.tenant_id, principal.tenantId))).limit(1).for('update')
      if (!reservation) throw new NotFoundException('Inventory reservation not found')
      if (event) return this.reservationResult(reservation, false, await this.availableQuantity(transaction, principal.tenantId, reservation.warehouse_id, reservation.material_item_id, reservation.uom_id))
      const current = reservationStatus(reservation.status)
      if (current !== 'active') throw new ConflictException(`Reservation cannot perform ${command.action} from status ${current}`)
      const next = command.action === 'release' ? 'released' : command.action === 'consume' ? 'consumed' : 'expired'
      const [updated] = await transaction.update(inventoryReservations).set({ status: next, released_by: command.action === 'release' || command.action === 'expire' ? principal.userId : reservation.released_by, released_at: command.action === 'release' || command.action === 'expire' ? new Date() : reservation.released_at, consumed_at: command.action === 'consume' ? new Date() : reservation.consumed_at, updated_at: new Date() }).where(and(eq(inventoryReservations.id, reservation.id), eq(inventoryReservations.tenant_id, principal.tenantId))).returning()
      if (!updated) throw new InternalServerErrorException('Reservation workflow update failed')
      await transaction.insert(inventoryReservationEvents).values({ tenant_id: principal.tenantId, reservation_id: reservation.id, action: command.action, quantity_micros: reservation.quantity_micros, actor_id: principal.userId, reason: command.reason ?? null, idempotency_key: idempotencyKey })
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'inventory_reservation', entityId: reservation.id, action: 'status_change', diff: { from: current, to: next, reason: command.reason ?? null } })
      return this.reservationResult(updated, true, await this.availableQuantity(transaction, principal.tenantId, reservation.warehouse_id, reservation.material_item_id, reservation.uom_id))
    })
  }

  private async lockInventory(transaction: DatabaseTransaction, tenantId: string, warehouseId: string, materialItemId: string): Promise<void> {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`roadmap:inventory:${tenantId}:${warehouseId}:${materialItemId}`}, 0))`)
  }

  private async availableQuantity(transaction: DatabaseTransaction, tenantId: string, warehouseId: string, materialItemId: string, uomId: string): Promise<bigint> {
    const [stock] = await transaction.select({ quantity: sql<string>`coalesce(sum(${stockLedgerEntries.quantity_delta_micros}), 0)::text` }).from(stockLedgerEntries).where(and(eq(stockLedgerEntries.tenant_id, tenantId), eq(stockLedgerEntries.warehouse_id, warehouseId), eq(stockLedgerEntries.material_item_id, materialItemId), eq(stockLedgerEntries.uom_id, uomId)))
    const [reserved] = await transaction.select({ quantity: sql<string>`coalesce(sum(${inventoryReservations.quantity_micros}), 0)::text` }).from(inventoryReservations).where(and(eq(inventoryReservations.tenant_id, tenantId), eq(inventoryReservations.warehouse_id, warehouseId), eq(inventoryReservations.material_item_id, materialItemId), eq(inventoryReservations.uom_id, uomId), eq(inventoryReservations.status, 'active'), or(isNull(inventoryReservations.expires_at), gt(inventoryReservations.expires_at, new Date()))))
    return availableInventory(BigInt(stock?.quantity ?? '0'), BigInt(reserved?.quantity ?? '0'))
  }

  private reservationResult(value: typeof inventoryReservations.$inferSelect, created: boolean, available: bigint) {
    return inventoryReservationResultSchema.parse({ reservationId: value.id, tenantId: value.tenant_id, status: value.status, quantityMicros: String(value.quantity_micros), availableQuantityMicros: available.toString(), created })
  }

  async applyLandedCost(input: ApplyLandedCostCommand, principal: ErpPrincipal, rawIdempotencyKey: string | undefined) {
    const command = applyLandedCostCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'landed_cost')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const [alreadyApplied] = await transaction
        .select({ id: landedCostDocuments.id, status: landedCostDocuments.status })
        .from(landedCostDocuments)
        .where(
          and(
            eq(landedCostDocuments.tenant_id, principal.tenantId),
            eq(landedCostDocuments.idempotency_key, idempotencyKey),
          ),
        )
        .limit(1)
      if (alreadyApplied) {
        if (alreadyApplied.status !== 'applied') {
          throw new ConflictException('A landed-cost command with this idempotency key is still incomplete')
        }
        return { landedCostDocumentId: alreadyApplied.id, status: 'applied' as const, created: false }
      }
      const [receipt] = await transaction.select().from(stockReceipts).where(and(eq(stockReceipts.id, command.stockReceiptId), eq(stockReceipts.tenant_id, principal.tenantId), eq(stockReceipts.status, 'posted'))).limit(1).for('share')
      if (!receipt) throw new ConflictException('Landed cost requires a posted stock receipt')
      const receiptLines = await transaction.select().from(stockReceiptLines).where(and(eq(stockReceiptLines.tenant_id, principal.tenantId), eq(stockReceiptLines.stock_receipt_id, receipt.id))).orderBy(asc(stockReceiptLines.line_number))
      if (receiptLines.length === 0) throw new ConflictException('Stock receipt has no lines')
      if (command.allocationBasis === 'weight') throw new ConflictException('Weight allocation requires receipt weight data and is not enabled yet')
      const total = command.lines.reduce((sum, line) => sum + BigInt(line.amountCents), 0n)
      const [document] = await transaction.insert(landedCostDocuments).values({ tenant_id: principal.tenantId, stock_receipt_id: receipt.id, document_number: command.documentNumber, idempotency_key: idempotencyKey, status: 'draft', currency: command.currency, total_cents: total, allocation_basis: command.allocationBasis, created_by: principal.userId }).returning()
      if (!document) throw new InternalServerErrorException('Landed cost document was not created')
      const insertedLines = await transaction.insert(landedCostLines).values(command.lines.map((line, index) => ({ tenant_id: principal.tenantId, landed_cost_document_id: document.id, line_number: index + 1, component_type: line.componentType, description: line.description, amount_cents: BigInt(line.amountCents) }))).returning()
      const bases = receiptLines.map((line) => command.allocationBasis === 'quantity' ? BigInt(line.quantity_micros) : BigInt(line.line_total_cents))
      const allocations = [] as Array<{ tenant_id: string; landed_cost_document_id: string; landed_cost_line_id: string; stock_receipt_line_id: string; allocation_basis_value: bigint; allocated_cents: bigint }>
      for (const line of insertedLines) {
        const allocated = allocateProRata(BigInt(line.amount_cents), bases)
        for (let index = 0; index < receiptLines.length; index += 1) {
          allocations.push({ tenant_id: principal.tenantId, landed_cost_document_id: document.id, landed_cost_line_id: line.id, stock_receipt_line_id: receiptLines[index]!.id, allocation_basis_value: bases[index]!, allocated_cents: allocated[index]! })
        }
      }
      const insertedAllocations = await transaction.insert(landedCostAllocations).values(allocations).returning()
      await transaction
        .update(landedCostDocuments)
        .set({ status: 'applied', applied_by: principal.userId, applied_at: new Date(), updated_at: new Date() })
        .where(
          and(
            eq(landedCostDocuments.id, document.id),
            eq(landedCostDocuments.tenant_id, principal.tenantId),
          ),
        )
      await transaction.execute(sql`
        select pg_catalog.set_config('app.stock_ledger_write', ${document.id}::text, true)
      `)
      for (const allocation of insertedAllocations) {
        const receiptLine = receiptLines.find((line) => line.id === allocation.stock_receipt_line_id)
        if (!receiptLine) throw new InternalServerErrorException('Landed cost receipt line disappeared')
        await transaction.insert(stockLedgerEntries).values({ tenant_id: principal.tenantId, event_type: 'landed_cost', landed_cost_document_id: document.id, landed_cost_allocation_id: allocation.id, warehouse_id: receipt.warehouse_id, material_item_id: receiptLine.material_item_id, uom_id: receiptLine.uom_id, occurred_on: receipt.received_date, quantity_delta_micros: 0, value_delta_cents: safeDbInteger(BigInt(allocation.allocated_cents), 'Landed cost allocation'), created_by: principal.userId })
      }
      const [applied] = await transaction.update(landedCostDocuments).set({ status: 'applied', applied_by: principal.userId, applied_at: new Date(), updated_at: new Date() }).where(and(eq(landedCostDocuments.id, document.id), eq(landedCostDocuments.tenant_id, principal.tenantId))).returning({ id: landedCostDocuments.id, status: landedCostDocuments.status })
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'landed_cost_document', entityId: document.id, action: 'create', diff: { stockReceiptId: receipt.id, totalCents: total.toString(), allocationBasis: command.allocationBasis } })
      return { landedCostDocumentId: applied?.id ?? document.id, status: 'applied' as const, created: true }
    })
  }

  async resolvePrice(input: PriceResolutionQuery, principal: ErpPrincipal) {
    const command = priceResolutionQuerySchema.parse(input)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'price_lists')
      await this.assertPrincipal(transaction, principal)
      const candidates = await transaction.select({ priceListId: priceLists.id, priceListItemId: priceListItems.id, vendorId: priceLists.vendor_id, unitPriceCents: priceListItems.unit_price_cents, minimumQuantityMicros: priceListItems.minimum_quantity_micros, validFrom: priceLists.valid_from, validTo: priceLists.valid_to, status: priceLists.status }).from(priceListItems).innerJoin(priceLists, and(eq(priceLists.id, priceListItems.price_list_id), eq(priceLists.tenant_id, principal.tenantId))).where(and(eq(priceListItems.tenant_id, principal.tenantId), eq(priceListItems.material_item_id, command.materialItemId), eq(priceListItems.uom_id, command.uomId), eq(priceLists.currency, command.currency)))
      const candidate = resolvePriceCandidate(candidates.map((value) => ({ ...value, unitPriceCents: asBigInt(value.unitPriceCents), minimumQuantityMicros: asBigInt(value.minimumQuantityMicros), validFrom: periodDate(value.validFrom), validTo: value.validTo ? periodDate(value.validTo) : null, status: value.status as 'draft' | 'active' | 'retired' })), BigInt(command.quantityMicros), command.asOf)
      const asOfTime = Date.parse(`${command.asOf}T00:00:00Z`)
      const stale = asOfTime - Date.parse(`${candidate.validFrom}T00:00:00Z`) > 90 * 86_400_000
      return priceResolutionResultSchema.parse({ priceListId: candidate.priceListId, priceListItemId: candidate.priceListItemId, vendorId: candidate.vendorId, unitPriceCents: candidate.unitPriceCents.toString(), currency: command.currency, stale, validFrom: candidate.validFrom, validTo: candidate.validTo })
    })
  }

  async createPriceList(
    input: CreatePriceListCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
  ) {
    const command = createPriceListCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'price_lists')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const replay = await this.workflowReplay(transaction, principal.tenantId, idempotencyKey)
      if (replay) {
        if (replay.entity_type !== 'price_list') throw new ConflictException('Idempotency key was already used for another workflow command')
        const [replayed] = await transaction
          .select()
          .from(priceLists)
          .where(and(eq(priceLists.id, replay.entity_id), eq(priceLists.tenant_id, principal.tenantId)))
          .limit(1)
        if (!replayed) throw new InternalServerErrorException('Price list creation replay target is missing')
        const [replayedCount] = await transaction.select({ count: sql<number>`count(*)::int` }).from(priceListItems).where(and(eq(priceListItems.tenant_id, principal.tenantId), eq(priceListItems.price_list_id, replayed.id)))
        return priceListResultSchema.parse({ priceListId: replayed.id, tenantId: replayed.tenant_id, code: replayed.code, status: replayed.status, itemCount: replayedCount?.count ?? 0, created: false })
      }
      const [existing] = await transaction
        .select()
        .from(priceLists)
        .where(and(eq(priceLists.tenant_id, principal.tenantId), eq(priceLists.code, command.code)))
        .limit(1)
      if (existing) {
        const [count] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(priceListItems)
          .where(and(eq(priceListItems.tenant_id, principal.tenantId), eq(priceListItems.price_list_id, existing.id)))
        if (existing.name !== command.name || existing.currency !== command.currency || (count?.count ?? 0) !== command.items.length) {
          throw new ConflictException('Price list code is already used by a different definition')
        }
        return priceListResultSchema.parse({ priceListId: existing.id, tenantId: existing.tenant_id, code: existing.code, status: existing.status, itemCount: count?.count ?? command.items.length, created: false })
      }
      const [created] = await transaction
        .insert(priceLists)
        .values({ tenant_id: principal.tenantId, code: command.code, name: command.name, vendor_id: command.vendorId ?? null, currency: command.currency, valid_from: command.validFrom, valid_to: command.validTo ?? null, status: 'draft', source: 'manual', created_by: principal.userId })
        .returning()
      if (!created) throw new InternalServerErrorException('Price list was not created')
      await transaction.insert(priceListItems).values(command.items.map((item) => ({ tenant_id: principal.tenantId, price_list_id: created.id, material_item_id: item.materialItemId, uom_id: item.uomId, minimum_quantity_micros: BigInt(item.minimumQuantityMicros), unit_price_cents: BigInt(item.unitPriceCents), lead_time_days: item.leadTimeDays ?? null, source_reference: item.sourceReference ?? null })))
      await this.recordWorkflowEvent(transaction, { tenantId: principal.tenantId, entityType: 'price_list', entityId: created.id, action: 'create', fromStatus: null, toStatus: created.status, payload: { code: created.code }, actorId: principal.userId, idempotencyKey })
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'price_list', entityId: created.id, action: 'create', diff: { code: created.code, itemCount: command.items.length, idempotencyKey } })
      return priceListResultSchema.parse({ priceListId: created.id, tenantId: created.tenant_id, code: created.code, status: created.status, itemCount: command.items.length, created: true })
    })
  }

  async transitionPriceList(
    priceListId: string,
    input: ActivatePriceListCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
  ) {
    const command = activatePriceListCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'price_lists')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const replay = await this.workflowReplay(transaction, principal.tenantId, idempotencyKey)
      if (replay) {
        if (replay.entity_type !== 'price_list' || replay.entity_id !== priceListId) {
          throw new ConflictException('Idempotency key was already used for another workflow command')
        }
        const [replayedList] = await transaction
          .select()
          .from(priceLists)
          .where(and(eq(priceLists.id, priceListId), eq(priceLists.tenant_id, principal.tenantId)))
          .limit(1)
        if (!replayedList) throw new InternalServerErrorException('Price list workflow replay target is missing')
        const [replayedItems] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(priceListItems)
          .where(and(eq(priceListItems.tenant_id, principal.tenantId), eq(priceListItems.price_list_id, priceListId)))
        return priceListResultSchema.parse({ priceListId: replayedList.id, tenantId: replayedList.tenant_id, code: replayedList.code, status: replayedList.status, itemCount: replayedItems?.count ?? 0, created: false })
      }
      const [list] = await transaction.select().from(priceLists).where(and(eq(priceLists.id, priceListId), eq(priceLists.tenant_id, principal.tenantId))).limit(1).for('update')
      if (!list) throw new NotFoundException('Price list not found')
      const [items] = await transaction.select({ count: sql<number>`count(*)::int` }).from(priceListItems).where(and(eq(priceListItems.tenant_id, principal.tenantId), eq(priceListItems.price_list_id, list.id)))
      if (command.action === 'activate' && (items?.count ?? 0) === 0) throw new ConflictException('Cannot activate a price list without items')
      const status = command.action === 'activate' ? 'active' : 'retired'
      const [updated] = await transaction.update(priceLists).set({ status, approved_by: command.action === 'activate' ? principal.userId : list.approved_by, approved_at: command.action === 'activate' ? new Date() : list.approved_at, updated_at: new Date() }).where(and(eq(priceLists.id, list.id), eq(priceLists.tenant_id, principal.tenantId))).returning()
      if (!updated) throw new InternalServerErrorException('Price list transition failed')
      await this.recordWorkflowEvent(transaction, {
        tenantId: principal.tenantId,
        entityType: 'price_list',
        entityId: list.id,
        action: command.action,
        fromStatus: list.status,
        toStatus: status,
        payload: { code: list.code },
        actorId: principal.userId,
        idempotencyKey,
      })
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'price_list', entityId: list.id, action: 'status_change', diff: { from: list.status, to: status, idempotencyKey } })
      return priceListResultSchema.parse({ priceListId: updated.id, tenantId: updated.tenant_id, code: updated.code, status: updated.status, itemCount: items?.count ?? 0, created: true })
    })
  }

  async createExchangeRate(input: CreateExchangeRateCommand, principal: ErpPrincipal, rawIdempotencyKey: string | undefined) {
    const command = createExchangeRateCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'multi_currency')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const replay = await this.workflowReplay(transaction, principal.tenantId, idempotencyKey)
      if (replay) {
        if (replay.entity_type !== 'exchange_rate') throw new ConflictException('Idempotency key was already used for another workflow command')
        const [replayed] = await transaction
          .select()
          .from(exchangeRates)
          .where(and(eq(exchangeRates.id, replay.entity_id), eq(exchangeRates.tenant_id, principal.tenantId)))
          .limit(1)
        if (!replayed) throw new InternalServerErrorException('Exchange-rate replay target is missing')
        return exchangeRateResultSchema.parse({ exchangeRateId: replayed.id, tenantId: replayed.tenant_id, fromCurrency: replayed.from_currency, toCurrency: replayed.to_currency, effectiveOn: periodDate(replayed.effective_on), created: false })
      }
      const [existing] = await transaction.select().from(exchangeRates).where(and(eq(exchangeRates.tenant_id, principal.tenantId), eq(exchangeRates.from_currency, command.fromCurrency), eq(exchangeRates.to_currency, command.toCurrency), eq(exchangeRates.effective_on, command.effectiveOn))).limit(1)
      if (existing) {
        if (String(existing.rate_numerator) !== command.rateNumerator || String(existing.rate_denominator) !== command.rateDenominator || existing.source !== command.source) throw new ConflictException('An exchange rate already exists for this currency pair and effective date')
        return exchangeRateResultSchema.parse({ exchangeRateId: existing.id, tenantId: existing.tenant_id, fromCurrency: existing.from_currency, toCurrency: existing.to_currency, effectiveOn: periodDate(existing.effective_on), created: false })
      }
      const [inverse] = await transaction
        .select({ numerator: exchangeRates.rate_numerator, denominator: exchangeRates.rate_denominator })
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.tenant_id, principal.tenantId),
            eq(exchangeRates.from_currency, command.toCurrency),
            eq(exchangeRates.to_currency, command.fromCurrency),
            eq(exchangeRates.effective_on, command.effectiveOn),
          ),
        )
        .limit(1)
      if (inverse) {
        const forwardNumerator = BigInt(command.rateNumerator)
        const forwardDenominator = BigInt(command.rateDenominator)
        if (forwardNumerator * BigInt(inverse.numerator) !== forwardDenominator * BigInt(inverse.denominator)) {
          throw new ConflictException('The existing inverse exchange rate does not reconcile to one')
        }
      }
      const [created] = await transaction.insert(exchangeRates).values({ tenant_id: principal.tenantId, from_currency: command.fromCurrency, to_currency: command.toCurrency, rate_numerator: BigInt(command.rateNumerator), rate_denominator: BigInt(command.rateDenominator), effective_on: command.effectiveOn, source: command.source, created_by: principal.userId }).returning()
      if (!created) throw new InternalServerErrorException('Exchange rate was not created')
      await this.recordWorkflowEvent(transaction, { tenantId: principal.tenantId, entityType: 'exchange_rate', entityId: created.id, action: 'create', fromStatus: null, toStatus: null, payload: { fromCurrency: created.from_currency, toCurrency: created.to_currency, effectiveOn: periodDate(created.effective_on) }, actorId: principal.userId, idempotencyKey })
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'exchange_rate', entityId: created.id, action: 'create', diff: { fromCurrency: command.fromCurrency, toCurrency: command.toCurrency, effectiveOn: command.effectiveOn, idempotencyKey } })
      return exchangeRateResultSchema.parse({ exchangeRateId: created.id, tenantId: created.tenant_id, fromCurrency: created.from_currency, toCurrency: created.to_currency, effectiveOn: periodDate(created.effective_on), created: true })
    })
  }

  async configureCurrency(
    input: TenantCurrencyCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
  ) {
    const command = tenantCurrencyCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'multi_currency')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const replay = await this.workflowReplay(transaction, principal.tenantId, idempotencyKey)
      if (replay) {
        if (replay.entity_type !== 'tenant_currency') {
          throw new ConflictException('Idempotency key was already used for another workflow command')
        }
        const [replayed] = await transaction
          .select()
          .from(tenantCurrencies)
          .where(and(eq(tenantCurrencies.id, replay.entity_id), eq(tenantCurrencies.tenant_id, principal.tenantId)))
          .limit(1)
        if (!replayed) throw new InternalServerErrorException('Currency configuration replay target is missing')
        return tenantCurrencyResultSchema.parse({ tenantCurrencyId: replayed.id, tenantId: replayed.tenant_id, currencyCode: replayed.currency_code, decimalPlaces: replayed.decimal_places, isBase: replayed.is_base, isActive: replayed.is_active, created: false })
      }
      const [existing] = await transaction
        .select()
        .from(tenantCurrencies)
        .where(and(eq(tenantCurrencies.tenant_id, principal.tenantId), eq(tenantCurrencies.currency_code, command.currencyCode)))
        .limit(1)
        .for('update')
      if (command.isBase) {
        await transaction
          .update(tenantCurrencies)
          .set({ is_base: false })
          .where(and(eq(tenantCurrencies.tenant_id, principal.tenantId), eq(tenantCurrencies.is_base, true)))
      }
      if (existing?.is_base && !command.isBase) {
        throw new ConflictException('Configure a replacement base currency before unsetting the current base')
      }
      const configured = existing
        ? (await transaction
            .update(tenantCurrencies)
            .set({ decimal_places: command.decimalPlaces, is_base: command.isBase, is_active: command.isActive })
            .where(and(eq(tenantCurrencies.id, existing.id), eq(tenantCurrencies.tenant_id, principal.tenantId)))
            .returning())[0]
        : (await transaction
            .insert(tenantCurrencies)
            .values({ tenant_id: principal.tenantId, currency_code: command.currencyCode, decimal_places: command.decimalPlaces, is_base: command.isBase, is_active: command.isActive, created_by: principal.userId })
            .returning())[0]
      if (!configured) throw new InternalServerErrorException('Currency configuration was not saved')
      await this.recordWorkflowEvent(transaction, { tenantId: principal.tenantId, entityType: 'tenant_currency', entityId: configured.id, action: 'configure', fromStatus: existing ? (existing.is_active ? 'active' : 'inactive') : null, toStatus: configured.is_active ? 'active' : 'inactive', payload: { currencyCode: configured.currency_code, decimalPlaces: configured.decimal_places, isBase: configured.is_base }, actorId: principal.userId, idempotencyKey })
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'tenant_currency', entityId: configured.id, action: 'update', diff: { currencyCode: configured.currency_code, decimalPlaces: configured.decimal_places, isBase: configured.is_base, isActive: configured.is_active, idempotencyKey } })
      return tenantCurrencyResultSchema.parse({ tenantCurrencyId: configured.id, tenantId: configured.tenant_id, currencyCode: configured.currency_code, decimalPlaces: configured.decimal_places, isBase: configured.is_base, isActive: configured.is_active, created: !existing })
    })
  }

  async convertCurrency(input: { amountMinorUnits: string; fromCurrency: string; toCurrency: string; asOf: string }, principal: ErpPrincipal) {
    if (!/^[A-Z]{3}$/.test(input.fromCurrency) || !/^[A-Z]{3}$/.test(input.toCurrency) || !/^\d+$/.test(input.amountMinorUnits) || !/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)) throw new BadRequestException('Invalid currency conversion request')
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'multi_currency')
      await this.assertPrincipal(transaction, principal)
      if (input.fromCurrency === input.toCurrency) return { fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, amountMinorUnits: input.amountMinorUnits, convertedMinorUnits: input.amountMinorUnits, rateNumerator: '1', rateDenominator: '1', effectiveOn: input.asOf }
      const [rate] = await transaction.select().from(exchangeRates).where(and(eq(exchangeRates.tenant_id, principal.tenantId), eq(exchangeRates.from_currency, input.fromCurrency), eq(exchangeRates.to_currency, input.toCurrency), lte(exchangeRates.effective_on, input.asOf))).orderBy(desc(exchangeRates.effective_on)).limit(1)
      if (!rate) throw new NotFoundException('No exchange rate is available for the requested date')
      const converted = convertMinorUnits(BigInt(input.amountMinorUnits), BigInt(rate.rate_numerator), BigInt(rate.rate_denominator))
      return { fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, amountMinorUnits: input.amountMinorUnits, convertedMinorUnits: converted.toString(), rateNumerator: String(rate.rate_numerator), rateDenominator: String(rate.rate_denominator), effectiveOn: periodDate(rate.effective_on) }
    })
  }

  async calculateTax(input: { baseCents: string; vatRateBps: number; withholdingRateBps: number; retentionRateBps: number; vatRegistered: boolean }, principal: ErpPrincipal) {
    const command = calculateTaxCommandSchema.parse(input)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'tax_statutory_outputs')
      await this.assertPrincipal(transaction, principal)
      return calculateTaxResultSchema.parse(calculateTax(BigInt(command.baseCents), command))
    })
  }

  async createTaxProfile(input: CreateTaxProfileCommand, principal: ErpPrincipal, rawIdempotencyKey: string | undefined) {
    const command = createTaxProfileCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'tax_statutory_outputs')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const replay = await this.workflowReplay(transaction, principal.tenantId, idempotencyKey)
      if (replay) {
        if (replay.entity_type !== 'tax_profile') throw new ConflictException('Idempotency key was already used for another workflow command')
        const [replayed] = await transaction
          .select()
          .from(taxProfiles)
          .where(and(eq(taxProfiles.id, replay.entity_id), eq(taxProfiles.tenant_id, principal.tenantId)))
          .limit(1)
        if (!replayed) throw new InternalServerErrorException('Tax profile creation replay target is missing')
        return taxProfileResultSchema.parse({ taxProfileId: replayed.id, tenantId: replayed.tenant_id, code: replayed.code, status: replayed.status, created: false })
      }
      const [existing] = await transaction.select().from(taxProfiles).where(and(eq(taxProfiles.tenant_id, principal.tenantId), eq(taxProfiles.code, command.code))).limit(1)
      if (existing) {
        if (existing.name !== command.name || existing.vat_rate_bps !== command.vatRateBps || existing.withholding_rate_bps !== command.withholdingRateBps || existing.retention_rate_bps !== command.retentionRateBps) throw new ConflictException('Tax profile code is already used by a different definition')
        return taxProfileResultSchema.parse({ taxProfileId: existing.id, tenantId: existing.tenant_id, code: existing.code, status: existing.status, created: false })
      }
      const [created] = await transaction.insert(taxProfiles).values({ tenant_id: principal.tenantId, code: command.code, name: command.name, valid_from: command.validFrom, valid_to: command.validTo ?? null, vat_rate_bps: command.vatRateBps, withholding_rate_bps: command.withholdingRateBps, retention_rate_bps: command.retentionRateBps, vat_registered: command.vatRegistered, bir_form_version: command.birFormVersion ?? null, statutory_configuration: command.statutoryConfiguration, status: 'draft', created_by: principal.userId }).returning()
      if (!created) throw new InternalServerErrorException('Tax profile was not created')
      await this.recordWorkflowEvent(transaction, { tenantId: principal.tenantId, entityType: 'tax_profile', entityId: created.id, action: 'create', fromStatus: null, toStatus: created.status, payload: { code: created.code }, actorId: principal.userId, idempotencyKey })
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'tax_profile', entityId: created.id, action: 'create', diff: { code: command.code, idempotencyKey } })
      return taxProfileResultSchema.parse({ taxProfileId: created.id, tenantId: created.tenant_id, code: created.code, status: created.status, created: true })
    })
  }

  async transitionTaxProfile(
    taxProfileId: string,
    input: TaxProfileWorkflowCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
  ) {
    const command = taxProfileWorkflowCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'tax_statutory_outputs')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const replay = await this.workflowReplay(transaction, principal.tenantId, idempotencyKey)
      if (replay) {
        if (replay.entity_type !== 'tax_profile' || replay.entity_id !== taxProfileId) {
          throw new ConflictException('Idempotency key was already used for another workflow command')
        }
        const [replayed] = await transaction
          .select()
          .from(taxProfiles)
          .where(and(eq(taxProfiles.id, taxProfileId), eq(taxProfiles.tenant_id, principal.tenantId)))
          .limit(1)
        if (!replayed) throw new InternalServerErrorException('Tax profile workflow replay target is missing')
        return taxProfileResultSchema.parse({ taxProfileId: replayed.id, tenantId: replayed.tenant_id, code: replayed.code, status: replayed.status, created: false })
      }
      const [profile] = await transaction
        .select()
        .from(taxProfiles)
        .where(and(eq(taxProfiles.id, taxProfileId), eq(taxProfiles.tenant_id, principal.tenantId)))
        .limit(1)
        .for('update')
      if (!profile) throw new NotFoundException('Tax profile not found')
      if (command.action === 'activate' && profile.status !== 'draft') throw new ConflictException('Only a draft tax profile can be activated')
      if (command.action === 'retire' && profile.status !== 'active') throw new ConflictException('Only an active tax profile can be retired')
      if (command.action === 'activate') {
        const [overlap] = await transaction
          .select({ id: taxProfiles.id })
          .from(taxProfiles)
          .where(
            and(
              eq(taxProfiles.tenant_id, principal.tenantId),
              eq(taxProfiles.status, 'active'),
              sql`${taxProfiles.id} <> ${profile.id}`,
              sql`${taxProfiles.valid_from} <= coalesce(${profile.valid_to}, '9999-12-31'::date)`,
              sql`coalesce(${taxProfiles.valid_to}, '9999-12-31'::date) >= ${profile.valid_from}`,
            ),
          )
          .limit(1)
        if (overlap) throw new ConflictException('An active tax profile already covers this effective date range')
      }
      const status = command.action === 'activate' ? 'active' : 'retired'
      const [updated] = await transaction
        .update(taxProfiles)
        .set({ status, approved_by: command.action === 'activate' ? principal.userId : profile.approved_by, approved_at: command.action === 'activate' ? new Date() : profile.approved_at, updated_at: new Date() })
        .where(and(eq(taxProfiles.id, profile.id), eq(taxProfiles.tenant_id, principal.tenantId)))
        .returning()
      if (!updated) throw new InternalServerErrorException('Tax profile transition failed')
      await this.recordWorkflowEvent(transaction, { tenantId: principal.tenantId, entityType: 'tax_profile', entityId: profile.id, action: command.action, fromStatus: profile.status, toStatus: status, payload: { code: profile.code }, actorId: principal.userId, idempotencyKey })
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'tax_profile', entityId: profile.id, action: 'status_change', diff: { from: profile.status, to: status, idempotencyKey } })
      return taxProfileResultSchema.parse({ taxProfileId: updated.id, tenantId: updated.tenant_id, code: updated.code, status: updated.status, created: true })
    })
  }

  async calculateTaxByProfile(input: { taxProfileId: string; baseCents: string; asOf: string }, principal: ErpPrincipal) {
    const command = calculateTaxByProfileCommandSchema.parse(input)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'tax_statutory_outputs')
      await this.assertPrincipal(transaction, principal)
      const [profile] = await transaction.select().from(taxProfiles).where(and(eq(taxProfiles.id, command.taxProfileId), eq(taxProfiles.tenant_id, principal.tenantId), eq(taxProfiles.status, 'active'), lte(taxProfiles.valid_from, command.asOf), or(isNull(taxProfiles.valid_to), gte(taxProfiles.valid_to, command.asOf)))).limit(1)
      if (!profile) throw new NotFoundException('No active tax profile applies on the requested date')
      return calculateTaxResultSchema.parse(calculateTax(BigInt(command.baseCents), { vatRateBps: profile.vat_rate_bps, withholdingRateBps: profile.withholding_rate_bps, retentionRateBps: profile.retention_rate_bps, vatRegistered: profile.vat_registered }))
    })
  }

  async generateStatutoryOutput(input: { taxProfileId: string; documentType: string; documentId: string; outputType: string; templateVersion: string; payload: Record<string, unknown> }, principal: ErpPrincipal, rawIdempotencyKey: string | undefined) {
    const command = generateStatutoryOutputCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'tax_statutory_outputs')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const [profile] = await transaction.select({ id: taxProfiles.id }).from(taxProfiles).where(and(eq(taxProfiles.id, command.taxProfileId), eq(taxProfiles.tenant_id, principal.tenantId))).limit(1)
      if (!profile) throw new NotFoundException('Tax profile not found')
      const contentHash = createHash('sha256').update(canonicalJson({ ...command, idempotencyKey: undefined })).digest('hex')
      const [existing] = await transaction.select().from(statutoryOutputs).where(and(eq(statutoryOutputs.tenant_id, principal.tenantId), eq(statutoryOutputs.document_type, command.documentType), eq(statutoryOutputs.document_id, command.documentId), eq(statutoryOutputs.output_type, command.outputType), eq(statutoryOutputs.template_version, command.templateVersion))).limit(1)
      if (existing) return statutoryOutputResultSchema.parse({ statutoryOutputId: existing.id, tenantId: existing.tenant_id, contentHash: existing.content_hash, created: false })
      const [output] = await transaction.insert(statutoryOutputs).values({ tenant_id: principal.tenantId, tax_profile_id: command.taxProfileId, document_type: command.documentType, document_id: command.documentId, output_type: command.outputType, template_version: command.templateVersion, payload: command.payload, content_hash: contentHash, generated_by: principal.userId }).returning()
      if (!output) throw new InternalServerErrorException('Statutory output was not generated')
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'statutory_output', entityId: output.id, action: 'create', diff: { documentType: command.documentType, documentId: command.documentId, outputType: command.outputType, templateVersion: command.templateVersion, idempotencyKey } })
      return statutoryOutputResultSchema.parse({ statutoryOutputId: output.id, tenantId: output.tenant_id, contentHash: output.content_hash, created: true })
    })
  }

  async closePeriod(input: FiscalPeriodCloseCommand, principal: ErpPrincipal, rawIdempotencyKey: string | undefined) {
    const command = fiscalPeriodCloseCommandSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'period_close')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const [existingRun] = await transaction.select().from(fiscalPeriodCloseRuns).where(and(eq(fiscalPeriodCloseRuns.tenant_id, principal.tenantId), eq(fiscalPeriodCloseRuns.idempotency_key, idempotencyKey))).limit(1)
      if (existingRun) return fiscalPeriodCloseResultSchema.parse({ fiscalPeriodId: existingRun.fiscal_period_id, tenantId: existingRun.tenant_id, status: existingRun.status, blockingCount: existingRun.blocking_count, checks: existingRun.checks })
      const [period] = await transaction.select().from(fiscalPeriods).where(and(eq(fiscalPeriods.id, command.fiscalPeriodId), eq(fiscalPeriods.tenant_id, principal.tenantId))).limit(1).for('update')
      if (!period) throw new NotFoundException('Fiscal period not found')
      const [draftRows] = await transaction.select({ count: sql<string>`count(*)::text` }).from(journalEntries).where(and(eq(journalEntries.tenant_id, principal.tenantId), eq(journalEntries.fiscal_period_id, period.id), eq(journalEntries.status, 'draft')))
      const [receiptRows] = await transaction
        .select({ count: sql<string>`count(*)::text` })
        .from(stockReceipts)
        .where(and(eq(stockReceipts.tenant_id, principal.tenantId), eq(stockReceipts.status, 'draft'), gte(stockReceipts.received_date, period.starts_on), lte(stockReceipts.received_date, period.ends_on)))
      const [billRows] = await transaction
        .select({ count: sql<string>`count(*)::text` })
        .from(supplierBills)
        .where(and(eq(supplierBills.tenant_id, principal.tenantId), eq(supplierBills.status, 'draft'), gte(supplierBills.bill_date, period.starts_on), lte(supplierBills.bill_date, period.ends_on)))
      const [cashRows] = await transaction
        .select({ count: sql<string>`count(*)::text` })
        .from(cashTransactions)
        .where(and(eq(cashTransactions.tenant_id, principal.tenantId), eq(cashTransactions.status, 'draft'), gte(cashTransactions.transaction_date, period.starts_on), lte(cashTransactions.transaction_date, period.ends_on)))
      const [reconciliationRows] = await transaction
        .select({ count: sql<string>`count(*)::text` })
        .from(bankStatements)
        .where(and(eq(bankStatements.tenant_id, principal.tenantId), eq(bankStatements.status, 'draft'), lte(bankStatements.statement_end, period.ends_on), gte(bankStatements.statement_end, period.starts_on)))
      const [reservationRows] = await transaction.select({ count: sql<string>`count(*)::text` }).from(inventoryReservations).where(and(eq(inventoryReservations.tenant_id, principal.tenantId), eq(inventoryReservations.status, 'active'), lte(inventoryReservations.created_at, new Date(`${period.ends_on}T23:59:59.999Z`))))
      const [sapRows] = await transaction.select({ count: sql<string>`count(*)::text` }).from(sapPostingOutbox).where(and(eq(sapPostingOutbox.tenant_id, principal.tenantId), inArray(sapPostingOutbox.status, ['pending', 'processing'])))
      const [providerRows] = await transaction.select({ count: sql<string>`count(*)::text` }).from(providerDeliveryOutbox).where(and(eq(providerDeliveryOutbox.tenant_id, principal.tenantId), inArray(providerDeliveryOutbox.status, ['pending', 'processing'])))
      const checks = [
        { key: 'draft_journal_entries', passed: BigInt(draftRows?.count ?? '0') === 0n, detail: `${draftRows?.count ?? '0'} draft journal entries in period` },
        { key: 'unposted_stock_receipts', passed: BigInt(receiptRows?.count ?? '0') === 0n, detail: `${receiptRows?.count ?? '0'} draft stock receipts in period` },
        { key: 'unposted_supplier_bills', passed: BigInt(billRows?.count ?? '0') === 0n, detail: `${billRows?.count ?? '0'} draft supplier bills in period` },
        { key: 'unposted_cash_transactions', passed: BigInt(cashRows?.count ?? '0') === 0n, detail: `${cashRows?.count ?? '0'} draft cash transactions in period` },
        { key: 'unreconciled_bank_statements', passed: BigInt(reconciliationRows?.count ?? '0') === 0n, detail: `${reconciliationRows?.count ?? '0'} draft bank statements ending in period` },
        { key: 'active_inventory_reservations', passed: BigInt(reservationRows?.count ?? '0') === 0n, detail: `${reservationRows?.count ?? '0'} active reservations created before period end` },
        { key: 'pending_sap_postings', passed: BigInt(sapRows?.count ?? '0') === 0n, detail: `${sapRows?.count ?? '0'} SAP postings pending` },
        { key: 'pending_provider_deliveries', passed: BigInt(providerRows?.count ?? '0') === 0n, detail: `${providerRows?.count ?? '0'} provider deliveries pending` },
      ]
      const status = closeStatus(checks)
      if (command.close && status === 'ready') await transaction.execute(sql`select public.close_fiscal_period(${period.id}::uuid, ${principal.userId}::uuid)`)
      const finalStatus = command.close && status === 'ready' ? 'closed' : status
      const [run] = await transaction.insert(fiscalPeriodCloseRuns).values({ tenant_id: principal.tenantId, fiscal_period_id: period.id, status: finalStatus, checks, blocking_count: checks.filter((check) => !check.passed).length, run_by: principal.userId, idempotency_key: idempotencyKey, completed_at: finalStatus === 'closed' ? new Date() : null }).returning()
      if (!run) throw new InternalServerErrorException('Fiscal period close run was not recorded')
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'fiscal_period', entityId: period.id, action: finalStatus === 'closed' ? 'lock' : 'query', diff: { status: finalStatus, checks } })
      return fiscalPeriodCloseResultSchema.parse({ fiscalPeriodId: run.fiscal_period_id, tenantId: run.tenant_id, status: run.status, blockingCount: run.blocking_count, checks: run.checks })
    })
  }

  async enqueueSap(input: SapPostingRequest, principal: ErpPrincipal, rawIdempotencyKey: string | undefined) {
    const command = sapPostingRequestSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'sap_posting')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const [existing] = await transaction.select().from(sapPostingOutbox).where(and(eq(sapPostingOutbox.tenant_id, principal.tenantId), eq(sapPostingOutbox.idempotency_key, idempotencyKey))).limit(1)
      if (existing) return sapPostingResultSchema.parse({ sapPostingId: existing.id, tenantId: existing.tenant_id, status: existing.status, created: false })
      const [posting] = await transaction.insert(sapPostingOutbox).values({ tenant_id: principal.tenantId, aggregate_type: command.aggregateType, aggregate_id: command.aggregateId, posting_type: command.postingType, idempotency_key: idempotencyKey, payload: command.payload, created_by: principal.userId }).returning()
      if (!posting) throw new InternalServerErrorException('SAP posting was not queued')
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'sap_posting', entityId: posting.id, action: 'create', diff: { aggregateType: command.aggregateType, aggregateId: command.aggregateId, postingType: command.postingType } })
      return sapPostingResultSchema.parse({ sapPostingId: posting.id, tenantId: posting.tenant_id, status: posting.status, created: true })
    })
  }

  async enqueueProviderDelivery(input: ProviderDeliveryRequest, principal: ErpPrincipal, rawIdempotencyKey: string | undefined) {
    const command = providerDeliveryRequestSchema.parse(input)
    const idempotencyKey = requireIdempotency(rawIdempotencyKey)
    return this.database.client.transaction(async (transaction) => {
      await this.requireFeature(transaction, principal, 'provider_delivery')
      await this.assertPrincipal(transaction, principal)
      await this.lockTenant(transaction, principal.tenantId)
      await this.audit.stampActor(transaction, principal)
      const [existing] = await transaction.select().from(providerDeliveryOutbox).where(and(eq(providerDeliveryOutbox.tenant_id, principal.tenantId), eq(providerDeliveryOutbox.idempotency_key, idempotencyKey))).limit(1)
      if (existing) return providerDeliveryResultSchema.parse({ deliveryId: existing.id, tenantId: existing.tenant_id, status: existing.status, created: false })
      const [delivery] = await transaction.insert(providerDeliveryOutbox).values({ tenant_id: principal.tenantId, channel: command.channel, provider: command.provider, event_type: command.eventType, aggregate_type: command.aggregateType, aggregate_id: command.aggregateId, recipient: command.recipient, subject: command.subject ?? null, body: command.body, template_version: command.templateVersion, idempotency_key: idempotencyKey, created_by: principal.userId }).returning()
      if (!delivery) throw new InternalServerErrorException('Provider delivery was not queued')
      await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'provider_delivery', entityId: delivery.id, action: 'create', diff: { channel: command.channel, provider: command.provider, aggregateType: command.aggregateType, aggregateId: command.aggregateId } })
      return providerDeliveryResultSchema.parse({ deliveryId: delivery.id, tenantId: delivery.tenant_id, status: delivery.status, created: true })
    })
  }
}
