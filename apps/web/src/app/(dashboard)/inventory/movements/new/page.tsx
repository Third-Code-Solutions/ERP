import type { Metadata } from 'next'
import Link from 'next/link'
import {
  requireCapability,
  requireUserProfile,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import { StockMovementForm } from '../movement-form'

export const metadata: Metadata = { title: 'New Stock Movement' }

interface WarehouseOption {
  [key: string]: unknown
  id: string
  code: string
  name: string
  project_id: string | null
}

interface ProjectOption {
  [key: string]: unknown
  id: string
  name: string
}

interface ItemOption {
  [key: string]: unknown
  id: string
  code: string
  description: string
  uom_code: string
}

interface CostCodeOption {
  [key: string]: unknown
  id: string
  code: string
  name: string
}

interface BalanceOption {
  [key: string]: unknown
  warehouse_id: string
  material_item_id: string
  quantity_micros: number
  value_cents: number
}

export default async function NewStockMovementPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'inventory.manage')

  const [warehouses, projects, items, costCodes, rawBalances] =
    await Promise.all([
      db.execute<WarehouseOption>(sql`
        select id, code, name, project_id
        from public.warehouses
        where tenant_id = ${profile.tenantId}::uuid
          and is_active
        order by code
      `),
      db.execute<ProjectOption>(sql`
        select id, name
        from public.projects
        where tenant_id = ${profile.tenantId}::uuid
        order by name
      `),
      db.execute<ItemOption>(sql`
        select
          item.id,
          item.code,
          item.description,
          uom.code as uom_code
        from public.material_items item
        join public.units_of_measure uom
          on uom.id = item.base_uom_id
         and uom.tenant_id = item.tenant_id
        where item.tenant_id = ${profile.tenantId}::uuid
          and item.is_active
          and item.inventory_tracked
          and uom.is_active
        order by item.code
      `),
      db.execute<CostCodeOption>(sql`
        select id, code, name
        from public.cost_codes
        where tenant_id = ${profile.tenantId}::uuid
          and is_active
        order by code
      `),
      db.execute<BalanceOption>(sql`
        select
          warehouse_id,
          material_item_id,
          sum(quantity_delta_micros)::bigint as quantity_micros,
          sum(value_delta_cents)::bigint as value_cents
        from public.stock_ledger_entries
        where tenant_id = ${profile.tenantId}::uuid
        group by warehouse_id, material_item_id
      `),
    ])
  const balances = rawBalances.map((balance) => ({
    ...balance,
    quantity_micros: Number(balance.quantity_micros),
    value_cents: Number(balance.value_cents),
  }))

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/inventory/movements">Stock Movements</Link>
        <span>/</span>
        <span>New</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Inventory / Controlled movement</p>
          <h1 className="page-title">New Stock Movement</h1>
          <p className="page-subtitle">
            Prepare transfer, project consumption, or counted adjustment
            evidence. Draft creation changes no balance.
          </p>
        </div>
      </div>

      {warehouses.length === 0 || items.length === 0 ? (
        <section className="finance-section">
          <div className="card-empty">
            <p>
              Configure an active Warehouse and inventory-tracked Item before
              preparing a movement.
            </p>
            <Link href="/inventory">Open Inventory setup</Link>
          </div>
        </section>
      ) : (
        <StockMovementForm
          warehouses={warehouses.map((warehouse) => ({
            id: warehouse.id,
            code: warehouse.code,
            name: warehouse.name,
            projectId: warehouse.project_id,
          }))}
          projects={projects}
          items={items.map((item) => ({
            id: item.id,
            code: item.code,
            description: item.description,
            uomCode: item.uom_code,
          }))}
          costCodes={costCodes}
          balances={balances.map((balance) => ({
            warehouseId: balance.warehouse_id,
            materialItemId: balance.material_item_id,
            quantityMicros: balance.quantity_micros,
            valueCents: balance.value_cents,
          }))}
          today={new Date().toISOString().slice(0, 10)}
        />
      )}
    </div>
  )
}
