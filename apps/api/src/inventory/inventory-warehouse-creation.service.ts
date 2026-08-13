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
  projects,
  users,
  warehouses,
} from '@third-code-erp/database/schema'
import {
  createInventoryWarehouseCommandSchema,
  inventoryWarehouseCreationResultSchema,
  type CreateInventoryWarehouseCommand,
  type InventoryWarehouseCreationResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class InventoryWarehouseCreationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    command: CreateInventoryWarehouseCommand,
    principal: ErpPrincipal
  ): Promise<InventoryWarehouseCreationResult> {
    const parsedCommand = createInventoryWarehouseCommandSchema.parse(command)
    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_WAREHOUSE_CREATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_WAREHOUSE_CREATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Inventory Warehouse creation is not enabled for this tenant; no Warehouse was changed.'
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
        if (!project) throw new NotFoundException('Project not found')
      }

      const [existing] = await transaction
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(
          and(
            eq(warehouses.tenant_id, authorizedPrincipal.tenantId),
            eq(warehouses.code, parsedCommand.code)
          )
        )
        .limit(1)
      if (existing) throw new ConflictException('Warehouse code already exists')

      const [created] = await transaction
        .insert(warehouses)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          code: parsedCommand.code,
          name: parsedCommand.name,
          project_id: parsedCommand.projectId,
          is_active: true,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [warehouses.tenant_id, warehouses.code],
        })
        .returning({
          id: warehouses.id,
          code: warehouses.code,
          name: warehouses.name,
          projectId: warehouses.project_id,
          isActive: warehouses.is_active,
          createdAt: warehouses.created_at,
          updatedAt: warehouses.updated_at,
        })
      if (!created) {
        throw new ConflictException('Warehouse code already exists')
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'warehouse',
        entityId: created.id,
        action: 'create',
        diff: {
          code: created.code,
          name: created.name,
          project_id: created.projectId,
          is_active: created.isActive,
        },
      })

      return inventoryWarehouseCreationResultSchema.parse({
        warehouseId: created.id,
        tenantId: authorizedPrincipal.tenantId,
        code: created.code,
        name: created.name,
        projectId: created.projectId,
        isActive: created.isActive,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      })
    })
  }
}
