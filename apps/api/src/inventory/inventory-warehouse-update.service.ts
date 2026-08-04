import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  stockLedgerEntries,
  users,
  warehouses,
} from '@third-code-erp/database/schema'
import {
  inventoryWarehouseUpdateResultSchema,
  type InventoryWarehouseUpdateResult,
  type UpdateInventoryWarehouseCommand,
  updateInventoryWarehouseCommandSchema,
} from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

interface WarehouseBalanceRow extends Record<string, unknown> {
  quantity_micros: string | number | bigint
  value_cents: string | number | bigint
}

@Injectable()
export class InventoryWarehouseUpdateService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async update(
    warehouseId: string,
    command: UpdateInventoryWarehouseCommand,
    principal: ErpPrincipal
  ): Promise<InventoryWarehouseUpdateResult> {
    const parsedCommand = updateInventoryWarehouseCommandSchema.parse(command)
    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Inventory Warehouse updates are not enabled for this tenant; no Warehouse was changed.'
      )
    }

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

      const [existing] = await transaction
        .select({
          id: warehouses.id,
          code: warehouses.code,
          name: warehouses.name,
          projectId: warehouses.project_id,
          isActive: warehouses.is_active,
          createdAt: warehouses.created_at,
          updatedAt: warehouses.updated_at,
        })
        .from(warehouses)
        .where(
          and(
            eq(warehouses.id, warehouseId),
            eq(warehouses.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!existing) throw new NotFoundException('Warehouse not found')

      if (
        existing.name === parsedCommand.name &&
        existing.isActive === parsedCommand.isActive
      ) {
        return this.toResult(authorizedPrincipal.tenantId, existing)
      }

      if (existing.isActive && !parsedCommand.isActive) {
        const [balance] = await transaction.execute<WarehouseBalanceRow>(sql`
          select
            coalesce(sum(${stockLedgerEntries.quantity_delta_micros}), 0)::text
              as quantity_micros,
            coalesce(sum(${stockLedgerEntries.value_delta_cents}), 0)::text
              as value_cents
          from ${stockLedgerEntries}
          where ${stockLedgerEntries.tenant_id} = ${authorizedPrincipal.tenantId}::uuid
            and ${stockLedgerEntries.warehouse_id} = ${warehouseId}::uuid
        `)

        const quantityMicros = String(balance?.quantity_micros ?? '0')
        const valueCents = String(balance?.value_cents ?? '0')
        if (quantityMicros !== '0' || valueCents !== '0') {
          throw new ConflictException(
            'Warehouse cannot be deactivated while its net stock balance is nonzero.'
          )
        }
      }

      const [updated] = await transaction
        .update(warehouses)
        .set({
          name: parsedCommand.name,
          is_active: parsedCommand.isActive,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(warehouses.id, warehouseId),
            eq(warehouses.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .returning({
          id: warehouses.id,
          code: warehouses.code,
          name: warehouses.name,
          projectId: warehouses.project_id,
          isActive: warehouses.is_active,
          createdAt: warehouses.created_at,
          updatedAt: warehouses.updated_at,
        })
      if (!updated) throw new NotFoundException('Warehouse not found')

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'warehouse',
        entityId: updated.id,
        action: 'update',
        diff: {
          before: {
            name: existing.name,
            is_active: existing.isActive,
          },
          after: {
            name: updated.name,
            is_active: updated.isActive,
          },
        },
      })

      return this.toResult(authorizedPrincipal.tenantId, updated)
    })
  }

  private toResult(
    tenantId: string,
    warehouse: {
      id: string
      code: string
      name: string
      projectId: string | null
      isActive: boolean
      createdAt: Date
      updatedAt: Date
    }
  ): InventoryWarehouseUpdateResult {
    return inventoryWarehouseUpdateResultSchema.parse({
      warehouseId: warehouse.id,
      tenantId,
      code: warehouse.code,
      name: warehouse.name,
      projectId: warehouse.projectId,
      isActive: warehouse.isActive,
      createdAt: warehouse.createdAt.toISOString(),
      updatedAt: warehouse.updatedAt.toISOString(),
    })
  }
}
