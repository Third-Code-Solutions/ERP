import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { stockLedgerEntries, users, warehouses } from '@third-code-erp/database/schema'
import {
  inventoryWarehouseCloseoutResultSchema,
  type InventoryWarehouseCloseoutResult,
} from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

interface WarehouseBalanceRow extends Record<string, unknown> {
  quantity_micros: string | number | bigint
  value_cents: string | number | bigint
}

@Injectable()
export class InventoryWarehouseCloseoutService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async read(
    warehouseId: string,
    principal: ErpPrincipal
  ): Promise<InventoryWarehouseCloseoutResult> {
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
        .for('share')

      const role = membership?.role as ErpRole | undefined
      if (
        !membership ||
        !role ||
        !roleHasCapability(role, 'inventory.closeout.read')
      ) {
        throw new ForbiddenException()
      }

      const [warehouse] = await transaction
        .select({
          id: warehouses.id,
          code: warehouses.code,
          name: warehouses.name,
          projectId: warehouses.project_id,
          isActive: warehouses.is_active,
        })
        .from(warehouses)
        .where(
          and(
            eq(warehouses.id, warehouseId),
            eq(warehouses.tenant_id, membership.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!warehouse) throw new NotFoundException('Warehouse not found')

      const [balance] = await transaction.execute<WarehouseBalanceRow>(sql`
        select
          coalesce(sum(${stockLedgerEntries.quantity_delta_micros}), 0)::text
            as quantity_micros,
          coalesce(sum(${stockLedgerEntries.value_delta_cents}), 0)::text
            as value_cents
        from ${stockLedgerEntries}
        where ${stockLedgerEntries.tenant_id} = ${membership.tenantId}::uuid
          and ${stockLedgerEntries.warehouse_id} = ${warehouseId}::uuid
      `)

      const quantityMicros = String(balance?.quantity_micros ?? '0')
      const valueCents = String(balance?.value_cents ?? '0')
      const zeroBalance = quantityMicros === '0' && valueCents === '0'
      const disposition = !warehouse.isActive
        ? 'already_inactive'
        : zeroBalance
          ? 'ready'
          : 'nonzero_balance'

      return inventoryWarehouseCloseoutResultSchema.parse({
        warehouseId: warehouse.id,
        tenantId: membership.tenantId,
        code: warehouse.code,
        name: warehouse.name,
        projectId: warehouse.projectId,
        isActive: warehouse.isActive,
        quantityMicros,
        valueCents,
        canDeactivate: !warehouse.isActive || zeroBalance,
        disposition,
      })
    })
  }
}
