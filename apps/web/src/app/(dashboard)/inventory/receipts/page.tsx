import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Stock Receipt register' }

interface ReceiptRow {
  [key: string]: unknown
  id: string
  internal_number: string | null
  status: 'draft' | 'posted' | 'reversed'
  received_date: string
  po_number: string
  project_name: string
  vendor_name: string | null
  warehouse_code: string
  warehouse_name: string
  line_count: number
  total_value_cents: number
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export default async function StockReceiptRegisterPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'inventory.read')
  const canManage = can(profile.role, 'inventory.manage')
  const rows = await db.execute<ReceiptRow>(sql`
    select
      receipt.id,
      receipt.internal_number,
      receipt.status,
      receipt.received_date,
      po.po_number,
      project.name as project_name,
      vendor.name as vendor_name,
      warehouse.code as warehouse_code,
      warehouse.name as warehouse_name,
      count(line.id)::integer as line_count,
      coalesce(sum(line.line_total_cents), 0)::bigint as total_value_cents
    from public.stock_receipts receipt
    join public.purchase_orders po
      on po.id = receipt.purchase_order_id
     and po.tenant_id = receipt.tenant_id
    join public.projects project
      on project.id = po.project_id
     and project.tenant_id = po.tenant_id
    left join public.vendors vendor
      on vendor.id = po.vendor_id
     and vendor.tenant_id = po.tenant_id
    join public.warehouses warehouse
      on warehouse.id = receipt.warehouse_id
     and warehouse.tenant_id = receipt.tenant_id
    left join public.stock_receipt_lines line
      on line.stock_receipt_id = receipt.id
     and line.tenant_id = receipt.tenant_id
    where receipt.tenant_id = ${profile.tenantId}::uuid
    group by receipt.id, po.id, project.id, vendor.id, warehouse.id
    order by receipt.received_date desc, receipt.created_at desc
  `)

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Inventory / Evidence register</p>
          <h1 className="page-title">Stock Receipts</h1>
          <p className="page-subtitle">
            Draft, posted, and reversed receipts remain in one traceable
            register. Posted history is never overwritten.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/inventory" className="finance-secondary-link">
            Inventory
          </Link>
          {canManage && (
            <Link
              href="/inventory/receipts/new"
              className="finance-primary-link"
            >
              New Stock Receipt
            </Link>
          )}
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Receipt register</p>
            <h2>Accepted stock evidence</h2>
          </div>
          <p>Posting adds stock and valuation. Reversal preserves both sides.</p>
        </div>
        <div className="finance-table-shell">
          {rows.length === 0 ? (
            <div className="card-empty">
              <p>No Stock Receipts yet.</p>
              {canManage && (
                <Link href="/inventory/receipts/new">
                  Prepare the first receipt
                </Link>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>PO / Supplier</th>
                  <th>Warehouse</th>
                  <th>Received</th>
                  <th>Lines</th>
                  <th>Status</th>
                  <th className="numeric">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        href={`/inventory/receipts/${row.id}`}
                        className="finance-entry-link"
                      >
                        {row.internal_number ?? 'Draft receipt'}
                      </Link>
                      <span className="finance-cell-detail">
                        {row.project_name}
                      </span>
                    </td>
                    <td>
                      {row.po_number}
                      <span className="finance-cell-detail">
                        {row.vendor_name ?? 'Supplier not set'}
                      </span>
                    </td>
                    <td>
                      {row.warehouse_code}
                      <span className="finance-cell-detail">
                        {row.warehouse_name}
                      </span>
                    </td>
                    <td>{row.received_date}</td>
                    <td>{Number(row.line_count)}</td>
                    <td>
                      <span
                        className={`finance-status finance-status-${row.status}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="numeric">
                      {formatMoney(Number(row.total_value_cents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
