import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { StockMovementActions } from '../movement-actions'

export const metadata: Metadata = { title: 'Stock Movement detail' }

interface MovementRow {
  [key: string]: unknown
  id: string
  internal_number: string | null
  movement_type: 'transfer' | 'consumption' | 'adjustment'
  status: 'draft' | 'posted' | 'reversed'
  movement_date: string
  currency: string
  reason: string
  source_code: string
  source_name: string
  target_code: string | null
  target_name: string | null
  project_name: string | null
  posting_journal_entry_id: string | null
  posting_journal_number: string | null
  reversal_journal_entry_id: string | null
  reversal_journal_number: string | null
  posted_at: string | null
  reversed_at: string | null
  reversal_reason: string | null
}

interface MovementLineRow {
  [key: string]: unknown
  id: string
  line_number: number
  item_code: string
  description: string
  uom_code: string
  cost_code: string | null
  quantity_micros: number
  declared_unit_cost_cents: number | null
  posted_unit_cost_cents: number | null
  posted_value_cents: number | null
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
  reverses_stock_ledger_entry_id: string | null
}

function quantity(micros: number): string {
  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 6,
    signDisplay: micros === 0 ? 'auto' : 'exceptZero',
  }).format(micros / 1_000_000)
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export default async function StockMovementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const profile = await requireUserProfile()
  requireCapability(profile, 'inventory.read')

  const [movementRows, rawLines, rawLedger] = await Promise.all([
    db.execute<MovementRow>(sql`
      select
        movement.id,
        movement.internal_number,
        movement.movement_type,
        movement.status,
        movement.movement_date,
        movement.currency,
        movement.reason,
        movement.posting_journal_entry_id,
        posted_journal.entry_number as posting_journal_number,
        movement.reversal_journal_entry_id,
        reversal_journal.entry_number as reversal_journal_number,
        movement.posted_at,
        movement.reversed_at,
        movement.reversal_reason,
        source.code as source_code,
        source.name as source_name,
        target.code as target_code,
        target.name as target_name,
        project.name as project_name
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
      left join public.journal_entries posted_journal
        on posted_journal.id = movement.posting_journal_entry_id
       and posted_journal.tenant_id = movement.tenant_id
      left join public.journal_entries reversal_journal
        on reversal_journal.id = movement.reversal_journal_entry_id
       and reversal_journal.tenant_id = movement.tenant_id
      where movement.id = ${id}::uuid
        and movement.tenant_id = ${profile.tenantId}::uuid
      limit 1
    `),
    db.execute<MovementLineRow>(sql`
      select
        line.id,
        line.line_number,
        item.code as item_code,
        line.description,
        uom.code as uom_code,
        cost_code.code as cost_code,
        line.quantity_micros,
        line.declared_unit_cost_cents,
        line.posted_unit_cost_cents,
        line.posted_value_cents
      from public.stock_movement_lines line
      join public.material_items item
        on item.id = line.material_item_id
       and item.tenant_id = line.tenant_id
      join public.units_of_measure uom
        on uom.id = line.uom_id
       and uom.tenant_id = line.tenant_id
      left join public.cost_codes cost_code
        on cost_code.id = line.cost_code_id
       and cost_code.tenant_id = line.tenant_id
      where line.stock_movement_id = ${id}::uuid
        and line.tenant_id = ${profile.tenantId}::uuid
      order by line.line_number
    `),
    db.execute<LedgerRow>(sql`
      select
        entry.id,
        entry.event_type,
        entry.occurred_on,
        item.code as item_code,
        warehouse.code as warehouse_code,
        entry.quantity_delta_micros,
        entry.value_delta_cents,
        entry.reverses_stock_ledger_entry_id
      from public.stock_ledger_entries entry
      join public.material_items item
        on item.id = entry.material_item_id
       and item.tenant_id = entry.tenant_id
      join public.warehouses warehouse
        on warehouse.id = entry.warehouse_id
       and warehouse.tenant_id = entry.tenant_id
      where entry.stock_movement_id = ${id}::uuid
        and entry.tenant_id = ${profile.tenantId}::uuid
      order by entry.created_at, entry.id
    `),
  ])
  const movement = movementRows[0]
  if (!movement) notFound()
  const lines = rawLines.map((line) => ({
    ...line,
    quantity_micros: Number(line.quantity_micros),
    declared_unit_cost_cents:
      line.declared_unit_cost_cents === null
        ? null
        : Number(line.declared_unit_cost_cents),
    posted_unit_cost_cents:
      line.posted_unit_cost_cents === null
        ? null
        : Number(line.posted_unit_cost_cents),
    posted_value_cents:
      line.posted_value_cents === null
        ? null
        : Number(line.posted_value_cents),
  }))
  const ledger = rawLedger.map((entry) => ({
    ...entry,
    quantity_delta_micros: Number(entry.quantity_delta_micros),
    value_delta_cents: Number(entry.value_delta_cents),
  }))
  const totalValue = lines.reduce(
    (total, line) => total + (line.posted_value_cents ?? 0),
    0
  )

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/inventory/movements">Stock Movements</Link>
        <span>/</span>
        <span>{movement.internal_number ?? 'Draft movement'}</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            {movement.movement_type.replaceAll('_', ' ')} /{' '}
            {movement.project_name ?? 'No Project'}
          </p>
          <h1 className="page-title">
            {movement.internal_number ?? 'Draft Stock Movement'}
          </h1>
          <p className="page-subtitle">
            {movement.source_code}
            {movement.target_code ? ` → ${movement.target_code}` : ''} /{' '}
            {movement.movement_date}
          </p>
        </div>
        <span className={`finance-status finance-status-${movement.status}`}>
          {movement.status}
        </span>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Posted value</p>
          <p className="kpi-card-value finance-money-kpi">
            {movement.status === 'draft'
              ? 'Pending'
              : money(totalValue, movement.currency)}
          </p>
          <p className="kpi-card-sub">{lines.length} controlled Items</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Source</p>
          <p className="kpi-card-value">{movement.source_code}</p>
          <p className="kpi-card-sub">{movement.source_name}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Destination</p>
          <p className="kpi-card-value">
            {movement.target_code ??
              (movement.movement_type === 'consumption'
                ? 'Project use'
                : 'Count result')}
          </p>
          <p className="kpi-card-sub">
            {movement.target_name ??
              movement.project_name ??
              movement.reason}
          </p>
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Controlled evidence</p>
            <h2>Movement lines</h2>
          </div>
          <p>{movement.reason}</p>
        </div>
        <div className="finance-table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>UOM</th>
                <th>Cost Code</th>
                <th className="numeric">Quantity</th>
                <th className="numeric">Posted unit cost</th>
                <th className="numeric">Posted value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.line_number}</td>
                  <td>
                    <strong>{line.item_code}</strong>
                    <span className="finance-cell-detail">
                      {line.description}
                    </span>
                  </td>
                  <td>{line.uom_code}</td>
                  <td>{line.cost_code ?? '—'}</td>
                  <td className="numeric">
                    {quantity(line.quantity_micros)}
                  </td>
                  <td className="numeric">
                    {line.posted_unit_cost_cents === null
                      ? line.declared_unit_cost_cents === null
                        ? 'Derived at posting'
                        : money(
                            line.declared_unit_cost_cents,
                            movement.currency
                          )
                      : money(
                          line.posted_unit_cost_cents,
                          movement.currency
                        )}
                  </td>
                  <td className="numeric">
                    {line.posted_value_cents === null
                      ? 'Pending'
                      : money(
                          line.posted_value_cents,
                          movement.currency
                        )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {ledger.length > 0 && (
        <section className="finance-section">
          <div className="finance-section-heading">
            <div>
              <p className="finance-eyebrow">Immutable consequence</p>
              <h2>Stock Ledger evidence</h2>
            </div>
            <p>
              {movement.posting_journal_number
                ? `Journal ${movement.posting_journal_number}`
                : movement.movement_type === 'transfer'
                  ? 'Inventory value remains inside the asset account.'
                  : 'Posting journal unavailable'}
              {movement.reversal_journal_number
                ? ` / reversal ${movement.reversal_journal_number}`
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
                  <th>Evidence</th>
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
                      {quantity(entry.quantity_delta_micros)}
                    </td>
                    <td className="numeric">
                      {money(
                        entry.value_delta_cents,
                        movement.currency
                      )}
                    </td>
                    <td>
                      {entry.reverses_stock_ledger_entry_id
                        ? 'Reversal of original entry'
                        : 'Original posting'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {movement.reversal_reason && (
            <p className="finance-control-note">
              Reversal reason: {movement.reversal_reason}
            </p>
          )}
        </section>
      )}

      <StockMovementActions
        movementId={movement.id}
        status={movement.status}
        movementDate={movement.movement_date}
        canManage={can(profile.role, 'inventory.manage')}
        canPost={can(profile.role, 'inventory.post_movement')}
      />
    </div>
  )
}
