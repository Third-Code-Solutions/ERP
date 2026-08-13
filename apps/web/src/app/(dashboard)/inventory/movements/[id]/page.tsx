import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { z } from 'zod'
import { getStockMovementDetail } from '@/lib/inventory-movement-detail-queries'
import { StockMovementActions } from '../movement-actions'

export const metadata: Metadata = { title: 'Stock Movement detail' }

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
  const detail = await getStockMovementDetail(profile.tenantId, id)
  if (!detail) notFound()
  const { movement, lines, ledger } = detail
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
