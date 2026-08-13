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
  deliverySchedules,
  poLineItems,
  purchaseOrders,
  stockReceiptCreateRequests,
  stockReceiptLines,
  stockReceipts,
  users,
  warehouses,
} from '@third-code-erp/database/schema'
import {
  createStockReceiptCommandSchema,
  quantityToMicros,
  receiptLineTotal,
  stockReceiptCreationResultSchema,
  type CreateStockReceiptCommand,
  type StockReceiptCreationResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function commandHash(command: CreateStockReceiptCommand): string {
  return createHash('sha256')
    .update(canonicalJson(command))
    .digest('hex')
}

function safeDatabaseInteger(value: bigint, label: string): number {
  if (value < 0n || value > MAX_POSTGRES_BIGINT) {
    throw new ConflictException(
      `Stock Receipt ${label} exceeds PostgreSQL bigint range`
    )
  }
  if (value > MAX_SAFE_INTEGER_BIGINT) {
    throw new ConflictException(
      `Stock Receipt ${label} exceeds supported exact range`
    )
  }
  return Number(value)
}

function replayResult(value: unknown): StockReceiptCreationResult {
  const parsed = stockReceiptCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Stock Receipt idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class StockReceiptCreationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    command: CreateStockReceiptCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<StockReceiptCreationResult> {
    const parsedCommand = createStockReceiptCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Stock Receipt command is not enabled for this tenant; no Stock Receipt was created.'
      )
    }

    const requestHash = commandHash(parsedCommand)
    return this.database.client.transaction(async (transaction) => {
      const [membership] = await transaction
        .select({
          tenantId: users.tenant_id,
          role: users.role,
          email: users.email,
        })
        .from(users)
        .where(
          and(
            eq(users.id, principal.userId),
            eq(users.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')

      const role = membership?.role as ErpRole | undefined
      if (
        !membership ||
        !role ||
        !roleHasCapability(role, 'inventory.manage')
      ) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      await transaction
        .insert(stockReceiptCreateRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            stockReceiptCreateRequests.tenant_id,
            stockReceiptCreateRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: stockReceiptCreateRequests.id,
          requestHash: stockReceiptCreateRequests.request_hash,
          state: stockReceiptCreateRequests.state,
          result: stockReceiptCreateRequests.result,
        })
        .from(stockReceiptCreateRequests)
        .where(
          and(
            eq(
              stockReceiptCreateRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(
              stockReceiptCreateRequests.idempotency_key,
              idempotencyKey
            )
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Stock Receipt idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different Stock Receipt command'
        )
      }
      if (request.state === 'succeeded') {
        return replayResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Stock Receipt idempotency record has an unsupported state'
        )
      }

      const [purchaseOrder] = await transaction
        .select({
          id: purchaseOrders.id,
          projectId: purchaseOrders.project_id,
        })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.id, parsedCommand.purchaseOrderId),
            eq(purchaseOrders.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!purchaseOrder) {
        throw new NotFoundException('Purchase Order not found')
      }

      const [warehouse] = await transaction
        .select({
          id: warehouses.id,
          projectId: warehouses.project_id,
          isActive: warehouses.is_active,
        })
        .from(warehouses)
        .where(
          and(
            eq(warehouses.id, parsedCommand.warehouseId),
            eq(warehouses.tenant_id, authorizedPrincipal.tenantId),
            eq(warehouses.is_active, true)
          )
        )
        .limit(1)
        .for('share')
      if (!warehouse) {
        throw new ConflictException(
          'Stock Receipt requires a valid PO and active Warehouse'
        )
      }
      if (
        warehouse.projectId !== null &&
        warehouse.projectId !== purchaseOrder.projectId
      ) {
        throw new ConflictException(
          'Project Warehouse must match the Purchase Order project'
        )
      }

      if (parsedCommand.deliveryScheduleId) {
        const [delivery] = await transaction
          .select({
            id: deliverySchedules.id,
            purchaseOrderId: deliverySchedules.purchase_order_id,
            status: deliverySchedules.status,
          })
          .from(deliverySchedules)
          .where(
            and(
              eq(deliverySchedules.id, parsedCommand.deliveryScheduleId),
              eq(
                deliverySchedules.tenant_id,
                authorizedPrincipal.tenantId
              )
            )
          )
          .limit(1)
          .for('share')
        if (
          !delivery ||
          delivery.purchaseOrderId !== purchaseOrder.id ||
          delivery.status !== 'accepted'
        ) {
          throw new ConflictException(
            'Linked Delivery must be accepted for the same PO'
          )
        }
      }

      const lineIds = parsedCommand.lines.map((line) => line.poLineItemId)
      if (new Set(lineIds).size !== lineIds.length) {
        throw new ConflictException(
          'Each Purchase Order line may appear once per Stock Receipt.'
        )
      }
      const sourceLines = await transaction
        .select({
          id: poLineItems.id,
          poId: poLineItems.po_id,
          description: poLineItems.description,
          materialItemId: poLineItems.material_item_id,
          uomId: poLineItems.uom_id,
          unitCostCents: sql<string>`${poLineItems.unit_cost_cents}::text`,
        })
        .from(poLineItems)
        .where(
          and(
            eq(poLineItems.tenant_id, authorizedPrincipal.tenantId),
            inArray(poLineItems.id, lineIds)
          )
        )
        .for('share')

      if (
        sourceLines.length !== lineIds.length ||
        sourceLines.some(
          (line) =>
            line.poId !== purchaseOrder.id ||
            !line.materialItemId ||
            !line.uomId
        )
      ) {
        throw new ConflictException(
          'Receipt line must match a tracked PO Item, UOM, and cost'
        )
      }

      const sourceById = new Map(
        sourceLines.map((line) => [line.id, line])
      )
      const lineValues = parsedCommand.lines.map((line, index) => {
        const source = sourceById.get(line.poLineItemId)
        if (!source || !source.materialItemId || !source.uomId) {
          throw new ConflictException(
            'Receipt line must match a tracked PO Item, UOM, and cost'
          )
        }
        let quantityMicros: bigint
        let unitCostCents: bigint
        let lineTotalCents: bigint
        try {
          quantityMicros = quantityToMicros(line.quantity)
          unitCostCents = BigInt(source.unitCostCents)
          lineTotalCents = receiptLineTotal(
            quantityMicros,
            unitCostCents
          )
        } catch (error) {
          if (error instanceof ConflictException) throw error
          throw new ConflictException(
            'Receipt line quantity and value must be positive and exact'
          )
        }
        return {
          lineNumber: index + 1,
          poLineItemId: source.id,
          materialItemId: source.materialItemId,
          uomId: source.uomId,
          description: source.description,
          quantityMicros: safeDatabaseInteger(
            quantityMicros,
            'quantity'
          ),
          unitCostCents: safeDatabaseInteger(
            unitCostCents,
            'unit cost'
          ),
          lineTotalCents: safeDatabaseInteger(
            lineTotalCents,
            'line total'
          ),
        }
      })

      const [created] = await transaction
        .insert(stockReceipts)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          warehouse_id: warehouse.id,
          purchase_order_id: purchaseOrder.id,
          delivery_schedule_id:
            parsedCommand.deliveryScheduleId ?? undefined,
          supplier_delivery_reference:
            parsedCommand.supplierDeliveryReference || undefined,
          received_date: parsedCommand.receivedDate,
          notes: parsedCommand.notes || undefined,
          created_by: authorizedPrincipal.userId,
        })
        .returning({ id: stockReceipts.id })
      if (!created) {
        throw new InternalServerErrorException(
          'Stock Receipt insert returned no record'
        )
      }

      await transaction.insert(stockReceiptLines).values(
        lineValues.map((line) => ({
          tenant_id: authorizedPrincipal.tenantId,
          stock_receipt_id: created.id,
          po_line_item_id: line.poLineItemId,
          material_item_id: line.materialItemId,
          uom_id: line.uomId,
          line_number: line.lineNumber,
          description: line.description,
          quantity_micros: line.quantityMicros,
          unit_cost_cents: line.unitCostCents,
          line_total_cents: line.lineTotalCents,
        }))
      )

      const result = stockReceiptCreationResultSchema.parse({
        stockReceiptId: created.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'draft',
        lineCount: lineValues.length,
      })
      const [completed] = await transaction
        .update(stockReceiptCreateRequests)
        .set({
          state: 'succeeded',
          stock_receipt_id: created.id,
          result,
          completed_at: new Date(),
        })
        .where(
          and(
            eq(stockReceiptCreateRequests.id, request.id),
            eq(stockReceiptCreateRequests.state, 'processing')
          )
        )
        .returning({ id: stockReceiptCreateRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Stock Receipt idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'stock_receipt',
        entityId: created.id,
        action: 'create',
        diff: {
          warehouse_id: warehouse.id,
          purchase_order_id: purchaseOrder.id,
          delivery_schedule_id: parsedCommand.deliveryScheduleId ?? null,
          line_count: lineValues.length,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }
}
