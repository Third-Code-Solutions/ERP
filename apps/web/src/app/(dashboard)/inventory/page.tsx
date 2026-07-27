import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  materialItems,
  projects,
  unitsOfMeasure,
  warehouses,
} from '@third-code-erp/database/schema'
import { asc, eq, sql } from 'drizzle-orm'
import {
  ConfigureItemForm,
  CreateUomForm,
  CreateWarehouseForm,
} from './setup-controls'

export const metadata: Metadata = { title: 'Inventory control center' }

interface BalanceRow {
  [key: string]: unknown
  warehouse_id: string
  warehouse_code: string
  warehouse_name: string
  item_id: string
  item_code: string
  item_description: string
  uom_code: string
  quantity_micros: number
  value_cents: number
}

function formatQuantity(micros: number): string {
  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 6,
  }).format(micros / 1_000_000)
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export default async function InventoryPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'inventory.read')
  const canManage = can(profile.role, 'inventory.manage')

  const [uoms, warehouseRows, items, projectRows, balances, counts] =
    await Promise.all([
      db
        .select()
        .from(unitsOfMeasure)
        .where(eq(unitsOfMeasure.tenant_id, profile.tenantId))
        .orderBy(asc(unitsOfMeasure.code)),
      db
        .select()
        .from(warehouses)
        .where(eq(warehouses.tenant_id, profile.tenantId))
        .orderBy(asc(warehouses.code)),
      db
        .select({
          id: materialItems.id,
          code: materialItems.code,
          description: materialItems.description,
          base_uom_id: materialItems.base_uom_id,
          inventory_tracked: materialItems.inventory_tracked,
          is_active: materialItems.is_active,
        })
        .from(materialItems)
        .where(eq(materialItems.tenant_id, profile.tenantId))
        .orderBy(asc(materialItems.code)),
      db
        .select({
          id: projects.id,
          code: projects.name,
          name: projects.name,
        })
        .from(projects)
        .where(eq(projects.tenant_id, profile.tenantId))
        .orderBy(asc(projects.name)),
      db.execute<BalanceRow>(sql`
        select
          warehouse.id as warehouse_id,
          warehouse.code as warehouse_code,
          warehouse.name as warehouse_name,
          item.id as item_id,
          item.code as item_code,
          item.description as item_description,
          uom.code as uom_code,
          sum(stock.quantity_delta_micros)::bigint as quantity_micros,
          sum(stock.value_delta_cents)::bigint as value_cents
        from public.stock_ledger_entries stock
        join public.warehouses warehouse
          on warehouse.id = stock.warehouse_id
         and warehouse.tenant_id = stock.tenant_id
        join public.material_items item
          on item.id = stock.material_item_id
         and item.tenant_id = stock.tenant_id
        join public.units_of_measure uom
          on uom.id = stock.uom_id
         and uom.tenant_id = stock.tenant_id
        where stock.tenant_id = ${profile.tenantId}::uuid
        group by warehouse.id, item.id, uom.code
        having sum(stock.quantity_delta_micros) <> 0
        order by warehouse.code, item.code
      `),
      db.execute<{
        [key: string]: unknown
        draft_count: number
        posted_count: number
      }>(sql`
        select
          count(*) filter (where status = 'draft')::integer as draft_count,
          count(*) filter (where status = 'posted')::integer as posted_count
        from public.stock_receipts
        where tenant_id = ${profile.tenantId}::uuid
      `),
    ])

  const trackedItems = items.filter((item) => item.inventory_tracked)
  const inventoryValue = balances.reduce(
    (sum, row) => sum + Number(row.value_cents),
    0
  )
  const receiptCounts = counts[0] ?? { draft_count: 0, posted_count: 0 }

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Operations / Perpetual stock</p>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">
            Know what entered, moved, was consumed, or was adjusted—and which
            immutable document proves every balance.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/purchase-orders" className="finance-secondary-link">
            Purchase Orders
          </Link>
          <Link href="/inventory/receipts" className="finance-secondary-link">
            Receipt register
          </Link>
          <Link href="/inventory/movements" className="finance-secondary-link">
            Movement register
          </Link>
          {canManage && (
            <Link
              href="/inventory/movements/new"
              className="finance-primary-link"
            >
              New Stock Movement
            </Link>
          )}
        </div>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">On-hand value</p>
          <p className="kpi-card-value finance-money-kpi">
            {formatMoney(inventoryValue)}
          </p>
          <p className="kpi-card-sub">All posted stock evidence, net of reversals</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Warehouses</p>
          <p className="kpi-card-value">
            {warehouseRows.filter((warehouse) => warehouse.is_active).length}
          </p>
          <p className="kpi-card-sub">Active stock destinations</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Tracked Items</p>
          <p className="kpi-card-value">{trackedItems.length}</p>
          <p className="kpi-card-sub">Catalog Items with a stable base UOM</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Receipt control</p>
          <p className="kpi-card-value">
            {Number(receiptCounts.draft_count)} /{' '}
            {Number(receiptCounts.posted_count)}
          </p>
          <p className="kpi-card-sub">Draft / active posted</p>
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Live balance</p>
            <h2>Stock by Warehouse and Item</h2>
          </div>
          <p>Derived only from append-only Stock Ledger Entries.</p>
        </div>
        <div className="finance-table-shell">
          {balances.length === 0 ? (
            <div className="card-empty">
              <p>No posted stock evidence yet.</p>
              {canManage && (
                <Link href="/inventory/receipts/new">
                  Prepare the first Stock Receipt
                </Link>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Warehouse</th>
                  <th>Item</th>
                  <th>UOM</th>
                  <th className="numeric">On hand</th>
                  <th className="numeric">Value</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr key={`${row.warehouse_id}:${row.item_id}`}>
                    <td>
                      <strong>{row.warehouse_code}</strong>
                      <span className="finance-cell-detail">
                        {row.warehouse_name}
                      </span>
                    </td>
                    <td>
                      <strong>{row.item_code}</strong>
                      <span className="finance-cell-detail">
                        {row.item_description}
                      </span>
                    </td>
                    <td>{row.uom_code}</td>
                    <td className="numeric">
                      {formatQuantity(Number(row.quantity_micros))}
                    </td>
                    <td className="numeric">
                      {formatMoney(Number(row.value_cents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {canManage && (
        <>
          <section className="finance-section">
            <div className="finance-section-heading">
              <div>
                <p className="finance-eyebrow">Control data</p>
                <h2>Units of measure</h2>
              </div>
              <p>One whole unit equals 1,000,000 exact micro-units.</p>
            </div>
            <CreateUomForm />
            <div className="finance-record-list">
              {uoms.map((uom) => (
                <div className="finance-record" key={uom.id}>
                  <div>
                    <strong>{uom.code}</strong>
                    <span>
                      {uom.name} / {uom.decimal_places} decimal places
                    </span>
                  </div>
                  <span
                    className={`finance-status finance-status-${
                      uom.is_active ? 'open' : 'closed'
                    }`}
                  >
                    {uom.is_active ? 'active' : 'inactive'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="finance-section">
            <div className="finance-section-heading">
              <div>
                <p className="finance-eyebrow">Physical custody</p>
                <h2>Warehouses</h2>
              </div>
              <p>Use a shared Warehouse or bind custody to one project.</p>
            </div>
            <CreateWarehouseForm projects={projectRows} />
            <div className="finance-record-list">
              {warehouseRows.map((warehouse) => (
                <div className="finance-record" key={warehouse.id}>
                  <div>
                    <strong>
                      {warehouse.code} / {warehouse.name}
                    </strong>
                    <span>
                      {warehouse.project_id
                        ? projectRows.find(
                            (project) => project.id === warehouse.project_id
                          )?.name ?? 'Project Warehouse'
                        : 'Shared Warehouse'}
                    </span>
                  </div>
                  <span
                    className={`finance-status finance-status-${
                      warehouse.is_active ? 'open' : 'closed'
                    }`}
                  >
                    {warehouse.is_active ? 'active' : 'inactive'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="finance-section">
            <div className="finance-section-heading">
              <div>
                <p className="finance-eyebrow">Item policy</p>
                <h2>Perpetual stock tracking</h2>
              </div>
              <p>Assign a stable base UOM before an Item can enter stock.</p>
            </div>
            <ConfigureItemForm
              items={items
                .filter((item) => item.is_active)
                .map((item) => ({
                  id: item.id,
                  code: item.code,
                  description: item.description,
                }))}
              uoms={uoms
                .filter((uom) => uom.is_active)
                .map((uom) => ({
                  id: uom.id,
                  code: uom.code,
                  name: uom.name,
                }))}
            />
            <div className="finance-record-list">
              {trackedItems.map((item) => (
                <div className="finance-record" key={item.id}>
                  <div>
                    <strong>
                      {item.code} / {item.description}
                    </strong>
                    <span>
                      Base UOM:{' '}
                      {uoms.find((uom) => uom.id === item.base_uom_id)?.code ??
                        'unmapped'}
                    </span>
                  </div>
                  <span className="finance-status finance-status-open">
                    tracked
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
