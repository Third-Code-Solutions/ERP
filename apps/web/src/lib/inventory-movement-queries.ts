import { db } from '@third-code-erp/database'
import { getUserProfile } from '@third-code-erp/auth'
import { sql } from 'drizzle-orm'
import type { InventoryStockMovementListResult } from '@third-code-erp/shared-types'
import {
  getInventoryStockMovementsThroughCoreApi,
  inventoryStockMovementReadsUseCoreApi,
} from './erp-core-client'

const MAX_ROWS = 500

export interface InventoryMovementPageRow {
  id: string
  internal_number: string | null
  movement_type: 'transfer' | 'consumption' | 'adjustment'
  status: 'draft' | 'posted' | 'reversed'
  movement_date: string
  reason: string
  source_code: string
  target_code: string | null
  project_name: string | null
  line_count: number
  total_value_cents: number
}

function safeInteger(value: string | number | bigint, label: string): number {
  let exact: bigint
  try {
    exact = typeof value === 'bigint' ? value : BigInt(String(value))
  } catch {
    throw new Error(`Stock Movement ${label} is not an integer`)
  }
  const result = Number(exact)
  if (!Number.isSafeInteger(result)) {
    throw new Error(`Stock Movement ${label} exceeds the safe display range`)
  }
  return result
}

function mapCoreResult(
  tenantId: string,
  result: InventoryStockMovementListResult
): InventoryMovementPageRow[] {
  if (result.tenantId.toLowerCase() !== tenantId.toLowerCase()) {
    throw new Error('Stock Movement register returned an invalid tenant scope')
  }
  if (result.total > MAX_ROWS || result.rows.length > MAX_ROWS) {
    throw new Error('Stock Movement register exceeds the display limit')
  }
  return result.rows.map((row) => ({
    id: row.id,
    internal_number: row.internalNumber,
    movement_type: row.movementType,
    status: row.status,
    movement_date: row.movementDate,
    reason: row.reason,
    source_code: row.sourceWarehouseCode,
    target_code: row.targetWarehouseCode,
    project_name: row.projectName,
    line_count: row.lineCount,
    total_value_cents: safeInteger(row.totalValueCents, 'value'),
  }))
}

async function readLegacyMovementRegister(
  tenantId: string
): Promise<InventoryMovementPageRow[]> {
  const rows = await db.execute<{
    [key: string]: unknown
    id: string
    internal_number: string | null
    movement_type: InventoryMovementPageRow['movement_type']
    status: InventoryMovementPageRow['status']
    movement_date: string
    reason: string
    source_code: string
    target_code: string | null
    project_name: string | null
    line_count: string | number | bigint
    total_value_cents: string | number | bigint
  }>(sql`
    select
      movement.id,
      movement.internal_number,
      movement.movement_type,
      movement.status,
      movement.movement_date,
      movement.reason,
      source.code as source_code,
      target.code as target_code,
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
    where movement.tenant_id = ${tenantId}::uuid
    group by movement.id, source.id, target.id, project.id
    order by movement.movement_date desc, movement.created_at desc
    limit ${MAX_ROWS + 1}
  `)
  if (rows.length > MAX_ROWS) {
    throw new Error('Stock Movement register exceeds the display limit')
  }
  return rows.map((row) => ({
    id: row.id,
    internal_number: row.internal_number,
    movement_type: row.movement_type,
    status: row.status,
    movement_date: row.movement_date,
    reason: row.reason,
    source_code: row.source_code,
    target_code: row.target_code,
    project_name: row.project_name,
    line_count: safeInteger(row.line_count, 'line count'),
    total_value_cents: safeInteger(row.total_value_cents, 'value'),
  }))
}

export async function getStockMovementRegister(
  tenantId: string
): Promise<InventoryMovementPageRow[]> {
  if (inventoryStockMovementReadsUseCoreApi(tenantId)) {
    const result = await getInventoryStockMovementsThroughCoreApi({
      page: 1,
      limit: MAX_ROWS,
    })
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'Stock Movement register was not read')
    }
    return mapCoreResult(tenantId, result.data)
  }
  return readLegacyMovementRegister(tenantId)
}

export async function getStockMovementRegisterForCurrentTenant(): Promise<
  InventoryMovementPageRow[]
> {
  const profile = await getUserProfile()
  if (!profile) throw new Error('Unauthorized')
  return getStockMovementRegister(profile.tenantId)
}
