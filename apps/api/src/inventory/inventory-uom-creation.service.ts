import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  unitsOfMeasure,
  users,
} from '@third-code-erp/database/schema'
import {
  createInventoryUomCommandSchema,
  inventoryUomCreationResultSchema,
  type CreateInventoryUomCommand,
  type InventoryUomCreationResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class InventoryUomCreationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    command: CreateInventoryUomCommand,
    principal: ErpPrincipal
  ): Promise<InventoryUomCreationResult> {
    const parsedCommand = createInventoryUomCommandSchema.parse(command)
    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_UOM_CREATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_UOM_CREATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Inventory UOM creation is not enabled for this tenant; no UOM was changed.'
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
        .select({ id: unitsOfMeasure.id })
        .from(unitsOfMeasure)
        .where(
          and(
            eq(unitsOfMeasure.tenant_id, authorizedPrincipal.tenantId),
            eq(unitsOfMeasure.code, parsedCommand.code)
          )
        )
        .limit(1)
      if (existing) throw new ConflictException('UOM code already exists')

      const [created] = await transaction
        .insert(unitsOfMeasure)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          code: parsedCommand.code,
          name: parsedCommand.name,
          decimal_places: parsedCommand.decimalPlaces,
          is_active: true,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [unitsOfMeasure.tenant_id, unitsOfMeasure.code],
        })
        .returning({
          id: unitsOfMeasure.id,
          code: unitsOfMeasure.code,
          name: unitsOfMeasure.name,
          decimalPlaces: unitsOfMeasure.decimal_places,
          isActive: unitsOfMeasure.is_active,
          createdAt: unitsOfMeasure.created_at,
          updatedAt: unitsOfMeasure.updated_at,
        })
      if (!created) throw new ConflictException('UOM code already exists')

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'unit_of_measure',
        entityId: created.id,
        action: 'create',
        diff: {
          code: created.code,
          name: created.name,
          decimal_places: created.decimalPlaces,
          is_active: created.isActive,
        },
      })

      return inventoryUomCreationResultSchema.parse({
        uomId: created.id,
        tenantId: authorizedPrincipal.tenantId,
        code: created.code,
        name: created.name,
        decimalPlaces: created.decimalPlaces,
        isActive: created.isActive,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      })
    })
  }
}
