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
  materialItems,
  unitsOfMeasure,
  users,
} from '@third-code-erp/database/schema'
import {
  configureInventoryItemCommandSchema,
  inventoryItemConfigurationResultSchema,
  type ConfigureInventoryItemCommand,
  type InventoryItemConfigurationResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class InventoryItemConfigurationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async configure(
    materialItemId: string,
    command: ConfigureInventoryItemCommand,
    principal: ErpPrincipal
  ): Promise<InventoryItemConfigurationResult> {
    const parsedCommand = configureInventoryItemCommandSchema.parse(command)
    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_ITEM_CONFIG_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_ITEM_CONFIG_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Inventory item configuration is not enabled for this tenant; no item was changed.'
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

      const [uom] = await transaction
        .select({ id: unitsOfMeasure.id, code: unitsOfMeasure.code })
        .from(unitsOfMeasure)
        .where(
          and(
            eq(unitsOfMeasure.id, parsedCommand.uomId),
            eq(unitsOfMeasure.tenant_id, authorizedPrincipal.tenantId),
            eq(unitsOfMeasure.is_active, true)
          )
        )
        .limit(1)
        .for('share')
      if (!uom) throw new ConflictException('Active UOM not found')

      const [existing] = await transaction
        .select({
          id: materialItems.id,
          baseUomId: materialItems.base_uom_id,
          inventoryTracked: materialItems.inventory_tracked,
          unit: materialItems.unit,
          updatedAt: materialItems.updated_at,
        })
        .from(materialItems)
        .where(
          and(
            eq(materialItems.id, materialItemId),
            eq(materialItems.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!existing) throw new NotFoundException('Item not found')

      if (
        existing.baseUomId === uom.id &&
        existing.inventoryTracked === parsedCommand.tracked &&
        existing.unit === uom.code
      ) {
        return this.toResult(
          authorizedPrincipal.tenantId,
          existing.id,
          existing.baseUomId,
          existing.inventoryTracked,
          existing.unit,
          existing.updatedAt
        )
      }

      const [updated] = await transaction
        .update(materialItems)
        .set({
          base_uom_id: uom.id,
          unit: uom.code,
          inventory_tracked: parsedCommand.tracked,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(materialItems.id, materialItemId),
            eq(materialItems.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .returning({
          id: materialItems.id,
          baseUomId: materialItems.base_uom_id,
          inventoryTracked: materialItems.inventory_tracked,
          unit: materialItems.unit,
          updatedAt: materialItems.updated_at,
        })
      if (!updated) throw new NotFoundException('Item not found')

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'material_item',
        entityId: updated.id,
        action: 'update',
        diff: {
          before: {
            base_uom_id: existing.baseUomId,
            inventory_tracked: existing.inventoryTracked,
            unit: existing.unit,
          },
          after: {
            base_uom_id: updated.baseUomId,
            inventory_tracked: updated.inventoryTracked,
            unit: updated.unit,
          },
        },
      })

      return this.toResult(
        authorizedPrincipal.tenantId,
        updated.id,
        updated.baseUomId,
        updated.inventoryTracked,
        updated.unit,
        updated.updatedAt
      )
    })
  }

  private toResult(
    tenantId: string,
    materialItemId: string,
    baseUomId: string,
    inventoryTracked: boolean,
    unit: string,
    updatedAt: Date
  ): InventoryItemConfigurationResult {
    return inventoryItemConfigurationResultSchema.parse({
      materialItemId,
      tenantId,
      baseUomId,
      inventoryTracked,
      unit,
      updatedAt: updatedAt.toISOString(),
    })
  }
}
