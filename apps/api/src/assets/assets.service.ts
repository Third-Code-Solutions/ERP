import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  assets,
  projects,
} from '@third-code-erp/database/schema'
import {
  assetListResultSchema,
  type AssetListQuery,
  type AssetListResult,
} from '@third-code-erp/shared-types'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

interface AssetListDatabaseRow {
  id: string
  tenantId: string
  assetTag: string
  name: string
  kind: 'equipment' | 'vehicle' | 'tool' | 'fixture' | 'other'
  status: 'active' | 'maintenance' | 'retired'
  serialNumber: string | null
  manufacturer: string | null
  model: string | null
  assignedProjectId: string | null
  assignedProjectName: string | null
  location: string | null
  commissionedOn: string | null
  retiredOn: string | null
  notes: string | null
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function toDate(value: string | Date | null): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  return value.toISOString().slice(0, 10)
}

@Injectable()
export class AssetsService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  async list(
    query: AssetListQuery,
    principal: ErpPrincipal
  ): Promise<AssetListResult> {
    this.assertReadEnabled(principal)

    const conditions = [eq(assets.tenant_id, principal.tenantId)]
    if (query.q) {
      const term = `%${query.q}%`
      const search = or(
        ilike(assets.asset_tag, term),
        ilike(assets.name, term),
        ilike(assets.serial_number, term),
        ilike(assets.manufacturer, term),
        ilike(assets.model, term)
      )
      if (search) conditions.push(search)
    }
    if (query.kind) conditions.push(eq(assets.kind, query.kind))
    if (query.status) conditions.push(eq(assets.status, query.status))

    const whereClause =
      conditions.length === 1 ? conditions[0] : and(...conditions)
    const sortColumn =
      query.sort === 'asset_tag'
        ? assets.asset_tag
        : query.sort === 'name'
          ? assets.name
          : query.sort === 'status'
            ? assets.status
            : assets.created_at
    const primaryOrder = query.order === 'asc' ? asc(sortColumn) : desc(sortColumn)
    const tieOrder = query.order === 'asc' ? asc(assets.id) : desc(assets.id)
    const offset = (query.page - 1) * query.limit

    const [rows, countRows] = await Promise.all([
      this.database.client
        .select({
          id: assets.id,
          tenantId: assets.tenant_id,
          assetTag: assets.asset_tag,
          name: assets.name,
          kind: assets.kind,
          status: assets.status,
          serialNumber: assets.serial_number,
          manufacturer: assets.manufacturer,
          model: assets.model,
          assignedProjectId: assets.assigned_project_id,
          assignedProjectName: projects.name,
          location: assets.location,
          commissionedOn: assets.commissioned_on,
          retiredOn: assets.retired_on,
          notes: assets.notes,
          createdBy: assets.created_by,
          createdAt: assets.created_at,
          updatedAt: assets.updated_at,
        })
        .from(assets)
        .leftJoin(
          projects,
          and(
            eq(projects.id, assets.assigned_project_id),
            eq(projects.tenant_id, principal.tenantId)
          )
        )
        .where(whereClause)
        .orderBy(primaryOrder, tieOrder)
        .limit(query.limit)
        .offset(offset),
      this.database.client
        .select({ count: sql<number>`count(*)::int` })
        .from(assets)
        .where(whereClause),
    ])

    const total = Number(countRows[0]?.count ?? 0)
    const totalPages = total === 0 ? 1 : Math.ceil(total / query.limit)

    return assetListResultSchema.parse({
      rows: (rows as AssetListDatabaseRow[]).map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        assetTag: row.assetTag,
        name: row.name,
        kind: row.kind,
        status: row.status,
        serialNumber: row.serialNumber,
        manufacturer: row.manufacturer,
        model: row.model,
        assignedProjectId: row.assignedProjectId,
        assignedProjectName: row.assignedProjectName,
        location: row.location,
        commissionedOn: toDate(row.commissionedOn),
        retiredOn: toDate(row.retiredOn),
        notes: row.notes,
        createdBy: row.createdBy,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_ASSET_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_ASSET_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Asset register reads are not enabled for this tenant.'
      )
    }
  }
}
