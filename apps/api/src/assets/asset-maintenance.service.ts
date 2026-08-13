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
  assetMaintenanceCreateRequests,
  assetMaintenanceRecords,
  assets,
  users,
} from '@third-code-erp/database/schema'
import {
  assetMaintenanceCreationResultSchema,
  assetMaintenanceDueResultSchema,
  assetMaintenanceListResultSchema,
  createAssetMaintenanceRecordCommandSchema,
  type AssetMaintenanceDueQuery,
  type AssetMaintenanceDueResult,
  type AssetMaintenanceListQuery,
  type AssetMaintenanceListResult,
  type AssetMaintenanceCreationResult,
  type CreateAssetMaintenanceRecordCommand,
} from '@third-code-erp/shared-types'
import { and, desc, eq, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function commandHash(command: CreateAssetMaintenanceRecordCommand): string {
  return createHash('sha256').update(canonicalJson(command)).digest('hex')
}

function replayResult(value: unknown): AssetMaintenanceCreationResult {
  const parsed = assetMaintenanceCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Asset maintenance idempotency result is invalid'
    )
  }
  return parsed.data
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function toDate(value: Date | string | null): string | null {
  if (value === null) return null
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10)
}

interface AssetMaintenanceDueDatabaseRow {
  [key: string]: unknown
  tenant_id: string
  asset_id: string
  asset_tag: string
  asset_name: string
  asset_kind: 'equipment' | 'vehicle' | 'tool' | 'fixture' | 'other'
  asset_status: 'active' | 'maintenance'
  assigned_project_id: string | null
  assigned_project_name: string | null
  location: string | null
  maintenance_record_id: string
  maintenance_type: 'preventive' | 'inspection' | 'repair' | 'calibration' | 'other'
  summary: string
  performed_on: string | Date
  next_due_on: string | Date
  days_until_due: string | number | bigint
  due_state: 'overdue' | 'due_soon'
  total_count: string | number | bigint
}

@Injectable()
export class AssetMaintenanceService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(
    assetId: string,
    query: AssetMaintenanceListQuery,
    principal: ErpPrincipal
  ): Promise<AssetMaintenanceListResult> {
    this.assertReadEnabled(principal)
    await this.assertAssetExists(assetId, principal)

    const whereClause = and(
      eq(assetMaintenanceRecords.tenant_id, principal.tenantId),
      eq(assetMaintenanceRecords.asset_id, assetId)
    )
    const offset = (query.page - 1) * query.limit
    const [rows, countRows] = await Promise.all([
      this.database.client
        .select()
        .from(assetMaintenanceRecords)
        .where(whereClause)
        .orderBy(
          desc(assetMaintenanceRecords.performed_on),
          desc(assetMaintenanceRecords.created_at),
          desc(assetMaintenanceRecords.id)
        )
        .limit(query.limit)
        .offset(offset),
      this.database.client
        .select({ count: sql<number>`count(*)::int` })
        .from(assetMaintenanceRecords)
        .where(whereClause),
    ])

    const total = Number(countRows[0]?.count ?? 0)
    return assetMaintenanceListResultSchema.parse({
      tenantId: principal.tenantId,
      assetId,
      rows: rows.map((row) => this.toResult(row)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 1 : Math.ceil(total / query.limit),
    })
  }

  async maintenanceDue(
    query: AssetMaintenanceDueQuery,
    principal: ErpPrincipal
  ): Promise<AssetMaintenanceDueResult> {
    this.assertReadEnabled(principal)

    const asOf = query.asOf ?? new Date().toISOString().slice(0, 10)
    const offset = (query.page - 1) * query.limit
    const rows = await this.database.client.execute<AssetMaintenanceDueDatabaseRow>(sql`
      select
        asset.tenant_id,
        asset.id as asset_id,
        asset.asset_tag,
        asset.name as asset_name,
        asset.kind as asset_kind,
        asset.status as asset_status,
        asset.assigned_project_id,
        project.name as assigned_project_name,
        asset.location,
        maintenance.id as maintenance_record_id,
        maintenance.maintenance_type,
        maintenance.summary,
        maintenance.performed_on,
        maintenance.next_due_on,
        (maintenance.next_due_on - ${asOf}::date)::integer as days_until_due,
        case
          when maintenance.next_due_on < ${asOf}::date then 'overdue'
          else 'due_soon'
        end as due_state,
        count(*) over()::integer as total_count
      from public.assets asset
      join lateral (
        select
          record.id,
          record.maintenance_type,
          record.summary,
          record.performed_on,
          record.next_due_on
        from public.asset_maintenance_records record
        where record.tenant_id = asset.tenant_id
          and record.asset_id = asset.id
        order by record.performed_on desc, record.created_at desc, record.id desc
        limit 1
      ) maintenance on maintenance.next_due_on is not null
      left join public.projects project
        on project.id = asset.assigned_project_id
       and project.tenant_id = asset.tenant_id
      where asset.tenant_id = ${principal.tenantId}::uuid
        and asset.status <> 'retired'
        and maintenance.next_due_on <= (${asOf}::date + ${query.daysAhead}::integer)
      order by maintenance.next_due_on asc, asset.asset_tag asc, asset.id asc
      limit ${query.limit}
      offset ${offset}
    `)

    const total = Number(rows[0]?.total_count ?? 0)
    return assetMaintenanceDueResultSchema.parse({
      tenantId: principal.tenantId,
      asOf,
      daysAhead: query.daysAhead,
      rows: rows.map((row) => ({
        tenantId: row.tenant_id,
        assetId: row.asset_id,
        assetTag: row.asset_tag,
        assetName: row.asset_name,
        assetKind: row.asset_kind,
        assetStatus: row.asset_status,
        assignedProjectId: row.assigned_project_id,
        assignedProjectName: row.assigned_project_name,
        location: row.location,
        maintenanceRecordId: row.maintenance_record_id,
        maintenanceType: row.maintenance_type,
        summary: row.summary,
        performedOn: toDate(row.performed_on),
        nextDueOn: toDate(row.next_due_on)!,
        daysUntilDue: Number(row.days_until_due),
        dueState: row.due_state,
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 1 : Math.ceil(total / query.limit),
    })
  }

  async create(
    assetId: string,
    command: CreateAssetMaintenanceRecordCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined
  ): Promise<AssetMaintenanceCreationResult> {
    const parsedCommand = createAssetMaintenanceRecordCommandSchema.parse(command)
    const idempotencyKey = (rawIdempotencyKey ?? '').trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    this.assertCreateEnabled(principal)
    const requestHash = commandHash(parsedCommand)

    return this.database.client.transaction(async (transaction) => {
      const membership = await this.lockMembership(transaction, principal)
      if (!membership || !roleHasCapability(membership.role, 'asset.maintenance.manage')) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role: membership.role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      await transaction
        .insert(assetMaintenanceCreateRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            assetMaintenanceCreateRequests.tenant_id,
            assetMaintenanceCreateRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: assetMaintenanceCreateRequests.id,
          requestHash: assetMaintenanceCreateRequests.request_hash,
          state: assetMaintenanceCreateRequests.state,
          result: assetMaintenanceCreateRequests.result,
        })
        .from(assetMaintenanceCreateRequests)
        .where(
          and(
            eq(
              assetMaintenanceCreateRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(assetMaintenanceCreateRequests.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Asset maintenance idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different asset maintenance command'
        )
      }
      if (request.state === 'succeeded') return replayResult(request.result)
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Asset maintenance idempotency record has an unsupported state'
        )
      }

      const [asset] = await transaction
        .select({ id: assets.id, status: assets.status })
        .from(assets)
        .where(
          and(eq(assets.id, assetId), eq(assets.tenant_id, authorizedPrincipal.tenantId))
        )
        .limit(1)
        .for('update')
      if (!asset) throw new NotFoundException('Asset not found')
      if (asset.status === 'retired') {
        throw new ConflictException(
          'Retired assets cannot receive new maintenance history.'
        )
      }

      const [created] = await transaction
        .insert(assetMaintenanceRecords)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          asset_id: assetId,
          maintenance_type: parsedCommand.maintenanceType,
          summary: parsedCommand.summary,
          performed_on: parsedCommand.performedOn,
          next_due_on: parsedCommand.nextDueOn,
          vendor_name: parsedCommand.vendorName,
          cost_cents: parsedCommand.costCents,
          notes: parsedCommand.notes,
          created_by: authorizedPrincipal.userId,
        })
        .returning()
      if (!created) {
        throw new InternalServerErrorException(
          'Asset maintenance record was not created'
        )
      }

      const result = assetMaintenanceCreationResultSchema.parse(
        this.toResult(created)
      )
      await transaction
        .update(assetMaintenanceCreateRequests)
        .set({
          state: 'succeeded',
          maintenance_record_id: created.id,
          result,
          completed_at: new Date(),
        })
        .where(eq(assetMaintenanceCreateRequests.id, request.id))

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'asset_maintenance_record',
        entityId: created.id,
        action: 'create',
        diff: {
          asset_id: assetId,
          maintenance_type: created.maintenance_type,
          performed_on: created.performed_on,
          next_due_on: created.next_due_on,
          cost_cents: created.cost_cents,
          idempotency_key_hash: requestHash,
        },
      })
      return result
    })
  }

  private async lockMembership(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal
  ): Promise<{ tenantId: string; role: ErpRole; email: string } | undefined> {
    const [membership] = await transaction
      .select({ tenantId: users.tenant_id, role: users.role, email: users.email })
      .from(users)
      .where(
        and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId))
      )
      .limit(1)
      .for('update')
    if (!membership) return undefined
    return {
      tenantId: membership.tenantId,
      role: membership.role as ErpRole,
      email: membership.email,
    }
  }

  private async assertAssetExists(assetId: string, principal: ErpPrincipal): Promise<void> {
    const [asset] = await this.database.client
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.tenant_id, principal.tenantId)))
      .limit(1)
    if (!asset) throw new NotFoundException('Asset not found')
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>('ERP_ASSET_MAINTENANCE_READS_ENABLED', false)
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_ASSET_MAINTENANCE_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Asset maintenance reads are not enabled for this tenant.'
      )
    }
  }

  private assertCreateEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Asset maintenance creation is not enabled for this tenant; no record was created.'
      )
    }
  }

  private toResult(row: typeof assetMaintenanceRecords.$inferSelect) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      assetId: row.asset_id,
      maintenanceType: row.maintenance_type,
      summary: row.summary,
      performedOn: toDate(row.performed_on),
      nextDueOn: toDate(row.next_due_on),
      vendorName: row.vendor_name,
      costCents: row.cost_cents,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: toIso(row.created_at),
    }
  }
}
