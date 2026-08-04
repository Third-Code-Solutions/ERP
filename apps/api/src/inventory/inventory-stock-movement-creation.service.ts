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
  costCodes,
  materialItems,
  projects,
  stockMovementCreateRequests,
  stockMovementLines,
  stockMovements,
  users,
  warehouses,
} from '@third-code-erp/database/schema'
import {
  createStockMovementCommandSchema,
  quantityToMicros,
  signedQuantityToMicros,
  stockMovementCreationResultSchema,
  type CreateStockMovementCommand,
  type StockMovementCreationResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray } from 'drizzle-orm'
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

function commandHash(command: CreateStockMovementCommand): string {
  return createHash('sha256')
    .update(canonicalJson(command))
    .digest('hex')
}

function safeDatabaseInteger(value: bigint, label: string): number {
  if (value < -MAX_POSTGRES_BIGINT || value > MAX_POSTGRES_BIGINT) {
    throw new ConflictException(
      `Stock Movement ${label} exceeds PostgreSQL bigint range`
    )
  }
  if (value < -MAX_SAFE_INTEGER_BIGINT || value > MAX_SAFE_INTEGER_BIGINT) {
    throw new ConflictException(
      `Stock Movement ${label} exceeds supported exact range`
    )
  }
  return Number(value)
}

function declaredUnitCostCents(value: string | null | undefined): number | null {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new ConflictException(
      'Declared unit cost requires up to two decimal places'
    )
  }
  const [whole, fraction = ''] = normalized.split('.')
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents <= 0n || cents > 100_000_000_000n) {
    throw new ConflictException(
      'Declared unit cost must be positive and within range'
    )
  }
  return safeDatabaseInteger(cents, 'declared unit cost')
}

function replayResult(value: unknown): StockMovementCreationResult {
  const parsed = stockMovementCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Stock Movement idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class InventoryStockMovementCreationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    command: CreateStockMovementCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<StockMovementCreationResult> {
    const parsedCommand = createStockMovementCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Stock Movement creation is not enabled for this tenant; no Stock Movement was created.'
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

      const itemIds = parsedCommand.lines.map((line) => line.materialItemId)
      if (new Set(itemIds).size !== itemIds.length) {
        throw new ConflictException(
          'Each Item may appear once per Stock Movement.'
        )
      }

      await transaction
        .insert(stockMovementCreateRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            stockMovementCreateRequests.tenant_id,
            stockMovementCreateRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: stockMovementCreateRequests.id,
          requestHash: stockMovementCreateRequests.request_hash,
          state: stockMovementCreateRequests.state,
          result: stockMovementCreateRequests.result,
        })
        .from(stockMovementCreateRequests)
        .where(
          and(
            eq(
              stockMovementCreateRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(stockMovementCreateRequests.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Stock Movement idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different Stock Movement command'
        )
      }
      if (request.state === 'succeeded') {
        return replayResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Stock Movement idempotency record has an unsupported state'
        )
      }

      const [sourceWarehouse] = await transaction
        .select({
          id: warehouses.id,
          projectId: warehouses.project_id,
        })
        .from(warehouses)
        .where(
          and(
            eq(warehouses.id, parsedCommand.sourceWarehouseId),
            eq(warehouses.tenant_id, authorizedPrincipal.tenantId),
            eq(warehouses.is_active, true)
          )
        )
        .limit(1)
        .for('share')
      if (!sourceWarehouse) {
        throw new ConflictException(
          'Stock Movement requires an active source Warehouse'
        )
      }

      let targetWarehouse: { id: string; projectId: string | null } | undefined
      if (parsedCommand.movementType === 'transfer') {
        if (
          !parsedCommand.targetWarehouseId ||
          parsedCommand.targetWarehouseId === parsedCommand.sourceWarehouseId
        ) {
          throw new ConflictException(
            'Transfer requires a different target Warehouse'
          )
        }
        const [target] = await transaction
          .select({ id: warehouses.id, projectId: warehouses.project_id })
          .from(warehouses)
          .where(
            and(
              eq(warehouses.id, parsedCommand.targetWarehouseId),
              eq(warehouses.tenant_id, authorizedPrincipal.tenantId),
              eq(warehouses.is_active, true)
            )
          )
          .limit(1)
          .for('share')
        if (!target) {
          throw new ConflictException(
            'Transfer requires an active target Warehouse'
          )
        }
        targetWarehouse = target
        if (
          (sourceWarehouse.projectId !== null || target.projectId !== null) &&
          !parsedCommand.projectId
        ) {
          throw new ConflictException(
            'Site Warehouse transfer requires its Project'
          )
        }
        if (
          parsedCommand.projectId &&
          ((sourceWarehouse.projectId !== null &&
            sourceWarehouse.projectId !== parsedCommand.projectId) ||
            (target.projectId !== null &&
              target.projectId !== parsedCommand.projectId))
        ) {
          throw new ConflictException('Transfer Warehouse must match its Project')
        }
      } else if (parsedCommand.movementType === 'consumption') {
        if (parsedCommand.targetWarehouseId || !parsedCommand.projectId) {
          throw new ConflictException(
            'Consumption requires one source Warehouse and Project'
          )
        }
        if (
          sourceWarehouse.projectId !== null &&
          sourceWarehouse.projectId !== parsedCommand.projectId
        ) {
          throw new ConflictException('Consumption Warehouse must match its Project')
        }
      } else {
        if (parsedCommand.targetWarehouseId) {
          throw new ConflictException('Adjustment uses one source Warehouse')
        }
        if (
          sourceWarehouse.projectId !== null &&
          (!parsedCommand.projectId ||
            sourceWarehouse.projectId !== parsedCommand.projectId)
        ) {
          throw new ConflictException(
            'Site Warehouse adjustment requires its Project'
          )
        }
      }

      if (parsedCommand.projectId) {
        const [project] = await transaction
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, parsedCommand.projectId),
              eq(projects.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
          .for('share')
        if (!project) throw new NotFoundException('Stock Movement Project is invalid')
      }

      const items = await transaction
        .select({
          id: materialItems.id,
          uomId: materialItems.base_uom_id,
          description: materialItems.description,
        })
        .from(materialItems)
        .where(
          and(
            eq(materialItems.tenant_id, authorizedPrincipal.tenantId),
            eq(materialItems.is_active, true),
            eq(materialItems.inventory_tracked, true),
            inArray(materialItems.id, itemIds)
          )
        )
        .for('share')
      if (items.length !== itemIds.length) {
        throw new ConflictException(
          'Stock Movement requires an active tracked Item and base UOM'
        )
      }
      const itemById = new Map(items.map((item) => [item.id, item]))

      const costCodeIds = parsedCommand.lines
        .map((line) => line.costCodeId)
        .filter((id): id is string => Boolean(id))
      const costCodeRows = costCodeIds.length
        ? await transaction
            .select({ id: costCodes.id, isActive: costCodes.is_active })
            .from(costCodes)
            .where(
              and(
                eq(costCodes.tenant_id, authorizedPrincipal.tenantId),
                inArray(costCodes.id, costCodeIds)
              )
            )
            .for('share')
        : []
      const costCodeById = new Map(
        costCodeRows.map((costCode) => [costCode.id, costCode])
      )

      const lineValues = parsedCommand.lines.map((line, index) => {
        const item = itemById.get(line.materialItemId)
        if (!item) {
          throw new ConflictException(
            'Stock Movement requires an active tracked Item and base UOM'
          )
        }
        let quantityMicros: bigint
        try {
          quantityMicros =
            parsedCommand.movementType === 'adjustment'
              ? signedQuantityToMicros(line.quantity)
              : quantityToMicros(line.quantity)
        } catch {
          throw new ConflictException(
            parsedCommand.movementType === 'adjustment'
              ? 'Adjustment quantity must be non-zero and use up to six decimal places'
              : 'Transfer and consumption quantity must be positive'
          )
        }
        const unitCostCents = declaredUnitCostCents(
          line.declaredUnitCostPhp
        )
        if (
          parsedCommand.movementType !== 'adjustment' &&
          (quantityMicros <= 0n || unitCostCents !== null)
        ) {
          throw new ConflictException(
            'Transfer and consumption quantity must be positive'
          )
        }
        if (
          parsedCommand.movementType === 'adjustment' &&
          quantityMicros > 0n &&
          unitCostCents === null
        ) {
          throw new ConflictException(
            'Positive adjustment requires an evidenced unit cost'
          )
        }
        if (
          parsedCommand.movementType === 'adjustment' &&
          quantityMicros < 0n &&
          unitCostCents !== null
        ) {
          throw new ConflictException(
            'Negative adjustment uses current weighted-average cost'
          )
        }

        if (parsedCommand.movementType === 'consumption') {
          if (!line.costCodeId) {
            throw new ConflictException('Consumption requires a Cost Code')
          }
          if (!costCodeById.get(line.costCodeId)?.isActive) {
            throw new ConflictException(
              'Consumption requires an active Cost Code'
            )
          }
        } else if (
          line.costCodeId &&
          !costCodeById.get(line.costCodeId)?.isActive
        ) {
          throw new ConflictException('Stock Movement Cost Code must be active')
        }

        return {
          tenant_id: authorizedPrincipal.tenantId,
          material_item_id: item.id,
          uom_id: item.uomId,
          cost_code_id: line.costCodeId ?? undefined,
          line_number: index + 1,
          description: item.description,
          quantity_micros: safeDatabaseInteger(quantityMicros, 'quantity'),
          declared_unit_cost_cents:
            unitCostCents === null
              ? undefined
              : safeDatabaseInteger(
                  BigInt(unitCostCents),
                  'declared unit cost'
                ),
        }
      })

      const [created] = await transaction
        .insert(stockMovements)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          movement_type: parsedCommand.movementType,
          source_warehouse_id: sourceWarehouse.id,
          target_warehouse_id: targetWarehouse?.id,
          project_id: parsedCommand.projectId ?? undefined,
          movement_date: parsedCommand.movementDate,
          currency: 'PHP',
          reason: parsedCommand.reason,
          created_by: authorizedPrincipal.userId,
        })
        .returning({ id: stockMovements.id })
      if (!created) {
        throw new InternalServerErrorException(
          'Stock Movement insert returned no record'
        )
      }

      await transaction.insert(stockMovementLines).values(
        lineValues.map((line) => ({
          ...line,
          stock_movement_id: created.id,
        }))
      )

      const result = stockMovementCreationResultSchema.parse({
        stockMovementId: created.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'draft',
        lineCount: lineValues.length,
      })
      const [completed] = await transaction
        .update(stockMovementCreateRequests)
        .set({
          state: 'succeeded',
          stock_movement_id: created.id,
          result,
          completed_at: new Date(),
        })
        .where(
          and(
            eq(stockMovementCreateRequests.id, request.id),
            eq(stockMovementCreateRequests.state, 'processing')
          )
        )
        .returning({ id: stockMovementCreateRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Stock Movement idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'stock_movement',
        entityId: created.id,
        action: 'create',
        diff: {
          movement_type: parsedCommand.movementType,
          source_warehouse_id: sourceWarehouse.id,
          target_warehouse_id: targetWarehouse?.id ?? null,
          project_id: parsedCommand.projectId ?? null,
          line_count: lineValues.length,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }
}
