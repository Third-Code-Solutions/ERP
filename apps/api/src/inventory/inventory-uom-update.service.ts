import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { unitsOfMeasure, users } from '@third-code-erp/database/schema'
import {
  inventoryUomUpdateResultSchema,
  type InventoryUomUpdateResult,
  type UpdateInventoryUomCommand,
  updateInventoryUomCommandSchema,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class InventoryUomUpdateService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async update(
    uomId: string,
    command: UpdateInventoryUomCommand,
    principal: ErpPrincipal
  ): Promise<InventoryUomUpdateResult> {
    const parsedCommand = updateInventoryUomCommandSchema.parse(command)
    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_UOM_UPDATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_UOM_UPDATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Inventory UOM updates are not enabled for this tenant; no UOM was changed.'
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
          id: unitsOfMeasure.id,
          code: unitsOfMeasure.code,
          name: unitsOfMeasure.name,
          decimalPlaces: unitsOfMeasure.decimal_places,
          isActive: unitsOfMeasure.is_active,
          createdAt: unitsOfMeasure.created_at,
          updatedAt: unitsOfMeasure.updated_at,
        })
        .from(unitsOfMeasure)
        .where(
          and(
            eq(unitsOfMeasure.id, uomId),
            eq(unitsOfMeasure.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!existing) throw new NotFoundException('UOM not found')

      if (
        existing.name === parsedCommand.name &&
        existing.isActive === parsedCommand.isActive
      ) {
        return this.toResult(authorizedPrincipal.tenantId, existing)
      }

      const [updated] = await transaction
        .update(unitsOfMeasure)
        .set({
          name: parsedCommand.name,
          is_active: parsedCommand.isActive,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(unitsOfMeasure.id, uomId),
            eq(unitsOfMeasure.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .returning({
          id: unitsOfMeasure.id,
          code: unitsOfMeasure.code,
          name: unitsOfMeasure.name,
          decimalPlaces: unitsOfMeasure.decimal_places,
          isActive: unitsOfMeasure.is_active,
          createdAt: unitsOfMeasure.created_at,
          updatedAt: unitsOfMeasure.updated_at,
        })
      if (!updated) throw new NotFoundException('UOM not found')

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'unit_of_measure',
        entityId: updated.id,
        action: 'update',
        diff: {
          before: { name: existing.name, is_active: existing.isActive },
          after: { name: updated.name, is_active: updated.isActive },
        },
      })

      return this.toResult(authorizedPrincipal.tenantId, updated)
    })
  }

  private toResult(
    tenantId: string,
    uom: {
      id: string
      code: string
      name: string
      decimalPlaces: number
      isActive: boolean
      createdAt: Date
      updatedAt: Date
    }
  ): InventoryUomUpdateResult {
    return inventoryUomUpdateResultSchema.parse({
      uomId: uom.id,
      tenantId,
      code: uom.code,
      name: uom.name,
      decimalPlaces: uom.decimalPlaces,
      isActive: uom.isActive,
      createdAt: uom.createdAt.toISOString(),
      updatedAt: uom.updatedAt.toISOString(),
    })
  }
}
