import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { StockReceiptActions } from '../../receipt-actions'

export const metadata: Metadata = { title: 'Stock Receipt detail' }

interface ReceiptRow {
  [key: string]: unknown
  id: string
  internal_number: string | null
  status: 'draft' | 'posted' | 'reversed'
  received_date: string
  currency: string
  supplier_delivery_reference: string | null
  notes: string | null
  po_number: string
  project_name: string
  vendor_name: string | null
  warehouse_code: string
  warehouse_name: string
  delivery_schedule_id: string | null
  posting_journal_entry_id: string | null
  posting_journal_number: string | null
  reversal_journal_entry_id: string | null
  reversal_journal_number: string | null
  posted_at: string | null
  reversed_at: string | null
  reversal_reason: string | null
}

interface ReceiptLineRow {
  [key: string]: unknown
  id: string
  line_number: number
  code: string | null
  description: string
  uom_code: string
  quantity_micros: number
  unit_cost_cents: number
  line_total_cents: number
}

interface LedgerRow {
  [key: string]: unknown
  id: string
  event_type: string
  occurred_on: string
  item_code: string
  warehouse_code: string
  quantity_delta_micros: number
  value_delta_cents: number
}

function formatQuantity(micros: number): string {
  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 6,
    signDisplay: micros === 0 ? 'auto' : 'exceptZero',
  }).format(micros / 1_000_000)
}

function formatMoney(cents: number, currency = 'PHP'): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export default async function StockReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await requireUuidRouteParams(params)
  if (!z.string().uuid().safeParse(id).success) notFound()
  const profile = await requireUserProfile()
  requireCapability(profile, 'inventory.read')

  const [receipts, lines, ledger] = await Promise.all([
    db.execute<ReceiptRow>(sql`
      select
        receipt.id,
        receipt.internal_number,
        receipt.status,
        receipt.received_date,
        receipt.currency,
        receipt.supplier_delivery_reference,
        receipt.notes,
        receipt.delivery_schedule_id,
        receipt.posting_journal_entry_id,
        posted_journal.entry_number as posting_journal_number,
        receipt.reversal_journal_entry_id,
        reversal_journal.entry_number as reversal_journal_number,
        receipt.posted_at,
        receipt.reversed_at,
        receipt.reversal_reason,
        po.po_number,
        project.name as project_name,
        vendor.name as vendor_name,
        warehouse.code as warehouse_code,
        warehouse.name as warehouse_name
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
      left join public.journal_entries posted_journal
        on posted_journal.id = receipt.posting_journal_entry_id
       and posted_journal.tenant_id = receipt.tenant_id
      left join public.journal_entries reversal_journal
        on reversal_journal.id = receipt.reversal_journal_entry_id
       and reversal_journal.tenant_id = receipt.tenant_id
      where receipt.id = ${id}::uuid
        and receipt.tenant_id = ${profile.tenantId}::uuid
      limit 1
    `),
    db.execute<ReceiptLineRow>(sql`
      select
        line.id,
        line.line_number,
        po_line.code,
        line.description,
        uom.code as uom_code,
        line.quantity_micros,
        line.unit_cost_cents,
        line.line_total_cents
      from public.stock_receipt_lines line
      join public.po_line_items po_line
        on po_line.id = line.po_line_item_id
       and po_line.tenant_id = line.tenant_id
      join public.units_of_measure uom
        on uom.id = line.uom_id
       and uom.tenant_id = line.tenant_id
      where line.stock_receipt_id = ${id}::uuid
        and line.tenant_id = ${profile.tenantId}::uuid
      order by line.line_number
    `),
    db.execute<LedgerRow>(sql`
      select
        stock.id,
        stock.event_type,
        stock.occurred_on,
        item.code as item_code,
        warehouse.code as warehouse_code,
        stock.quantity_delta_micros,
        stock.value_delta_cents
      from public.stock_ledger_entries stock
      join public.material_items item
        on item.id = stock.material_item_id
       and item.tenant_id = stock.tenant_id
      join public.warehouses warehouse
        on warehouse.id = stock.warehouse_id
       and warehouse.tenant_id = stock.tenant_id
      where stock.stock_receipt_id = ${id}::uuid
        and stock.tenant_id = ${profile.tenantId}::uuid
      order by stock.created_at, stock.id
    `),
  ])
  const receipt = receipts[0]
  if (!receipt) notFound()
  const total = lines.reduce(
    (sum, line) => sum + Number(line.line_total_cents),
    0
  )

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/inventory/receipts">Stock Receipts</Link>
        <span>/</span>
        <span>{receipt.internal_number ?? 'Draft receipt'}</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            {receipt.project_name} / {receipt.po_number}
          </p>
          <h1 className="page-title">
            {receipt.internal_number ?? 'Draft Stock Receipt'}
          </h1>
          <p className="page-subtitle">
            {receipt.vendor_name ?? 'Supplier not set'} /{' '}
            {receipt.warehouse_code} / received {receipt.received_date}
          </p>
        </div>
        <span className={`finance-status finance-status-${receipt.status}`}>
          {receipt.status}
        </span>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Receipt value</p>
          <p className="kpi-card-value finance-money-kpi">
            {formatMoney(total, receipt.currency)}
          </p>
          <p className="kpi-card-sub">{lines.length} accepted PO lines</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Warehouse</p>
          <p className="kpi-card-value">{receipt.warehouse_code}</p>
          <p className="kpi-card-sub">{receipt.warehouse_name}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Supplier evidence</p>
          <p className="kpi-card-value">
            {receipt.supplier_delivery_reference ?? '—'}
          </p>
          <p className="kpi-card-sub">
            {receipt.delivery_schedule_id
              ? 'Accepted Delivery linked'
              : 'No Delivery link'}
          </p>
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Accepted evidence</p>
            <h2>Receipt lines</h2>
          </div>
          <p>Item, base UOM, PO cost, and quantity lock at posting.</p>
        </div>
        <div className="finance-table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>UOM</th>
                <th className="numeric">Quantity</th>
                <th className="numeric">Unit cost</th>
                <th className="numeric">Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.line_number}</td>
                  <td>
                    <strong>{line.code ?? 'Uncoded item'}</strong>
                    <span className="finance-cell-detail">
                      {line.description}
                    </span>
                  </td>
                  <td>{line.uom_code}</td>
                  <td className="numeric">
                    {formatQuantity(Number(line.quantity_micros))}
                  </td>
                  <td className="numeric">
                    {formatMoney(
                      Number(line.unit_cost_cents),
                      receipt.currency
                    )}
                  </td>
                  <td className="numeric">
                    {formatMoney(
                      Number(line.line_total_cents),
                      receipt.currency
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {receipt.notes && (
          <p className="finance-control-note">Receiving note: {receipt.notes}</p>
        )}
      </section>

      {ledger.length > 0 && (
        <section className="finance-section">
          <div className="finance-section-heading">
            <div>
              <p className="finance-eyebrow">Immutable consequence</p>
              <h2>Stock Ledger evidence</h2>
            </div>
            <p>
              {receipt.posting_journal_number
                ? `Accounting journal ${receipt.posting_journal_number}`
                : 'Posting journal pending'}
              {receipt.reversal_journal_number
                ? ` / reversal ${receipt.reversal_journal_number}`
                : ''}
            </p>
          </div>
          <div className="finance-table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Item / Warehouse</th>
                  <th className="numeric">Quantity delta</th>
                  <th className="numeric">Value delta</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.event_type.replaceAll('_', ' ')}</td>
                    <td>{entry.occurred_on}</td>
                    <td>
                      {entry.item_code} / {entry.warehouse_code}
                    </td>
                    <td className="numeric">
                      {formatQuantity(Number(entry.quantity_delta_micros))}
                    </td>
                    <td className="numeric">
                      {formatMoney(
                        Number(entry.value_delta_cents),
                        receipt.currency
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {receipt.reversal_reason && (
            <p className="finance-control-note">
              Reversal reason: {receipt.reversal_reason}
            </p>
          )}
        </section>
      )}

      <StockReceiptActions
        receiptId={receipt.id}
        status={receipt.status}
        receivedDate={receipt.received_date}
        canManage={can(profile.role, 'inventory.manage')}
        canPost={can(profile.role, 'inventory.post_receipt')}
      />
    </div>
  )
}
