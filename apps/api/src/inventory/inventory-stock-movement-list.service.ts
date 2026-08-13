import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import {
  inventoryStockMovementListResultSchema,
  type InventoryStockMovementListQuery,
  type InventoryStockMovementListResult,
} from '@third-code-erp/shared-types'
import { sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

interface StockMovementRow {
  [key: string]: unknown
  id: string
  internal_number: string | null
  movement_type: string
  status: string
  movement_date: string
  reason: string
  source_warehouse_code: string
  target_warehouse_code: string | null
  project_name: string | null
  line_count: string | number | bigint
  total_value_cents: string | number | bigint
}

interface CountRow {
  [key: string]: unknown
  total: string | number | bigint
}

@Injectable()
export class InventoryStockMovementListService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async list(
    query: InventoryStockMovementListQuery,
    principal: ErpPrincipal
  ): Promise<InventoryStockMovementListResult> {
    const filters = [sql`movement.tenant_id = ${principal.tenantId}::uuid`]
    if (query.movementType) {
      filters.push(sql`movement.movement_type = ${query.movementType}`)
    }
    if (query.status) {
      filters.push(sql`movement.status = ${query.status}`)
    }
    const whereClause = sql.join(filters, sql` and `)
    const offset = (query.page - 1) * query.limit

    const [rows, countRows] = await Promise.all([
      this.database.client.execute<StockMovementRow>(sql`
        select
          movement.id,
          movement.internal_number,
          movement.movement_type,
          movement.status,
          movement.movement_date,
          movement.reason,
          source.code as source_warehouse_code,
          target.code as target_warehouse_code,
          project.name as project_name,
          count(line.id)::integer as line_count,
          coalesce(sum(line.posted_value_cents), 0)::bigint
            as total_value_cents
        from public.stock_movements movement
        join public.warehouses source
          on source.id = movement.source_warehouse_id
         and source.tenant_id = movement.tenant_id
        left join public.warehouses target
          on target.id = movement.target_warehouse_id
         and target.tenant_id = movement.tenant_id
        left join public.projects project
          on project.id = movement.project_id
         and project.tenant_id = movement.tenant_id
        left join public.stock_movement_lines line
          on line.stock_movement_id = movement.id
         and line.tenant_id = movement.tenant_id
        where ${whereClause}
        group by movement.id, source.id, target.id, project.id
        order by movement.movement_date desc, movement.created_at desc
        limit ${query.limit} offset ${offset}
      `),
      this.database.client.execute<CountRow>(sql`
        select count(*)::integer as total
        from public.stock_movements movement
        where ${whereClause}
      `),
    ])

    const total = Number(countRows[0]?.total ?? 0)
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new BadRequestException('Stock Movement count is out of range')
    }
    const totalPages = total === 0 ? 1 : Math.ceil(total / query.limit)

    return inventoryStockMovementListResultSchema.parse({
      tenantId: principal.tenantId,
      rows: rows.map((row) => ({
        id: row.id,
        internalNumber: row.internal_number,
        movementType: row.movement_type,
        status: row.status,
        movementDate: row.movement_date,
        reason: row.reason,
        sourceWarehouseCode: row.source_warehouse_code,
        targetWarehouseCode: row.target_warehouse_code,
        projectName: row.project_name,
        lineCount: Number(row.line_count),
        totalValueCents: String(row.total_value_cents),
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    })
  }
}
