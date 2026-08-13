import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { getStockMovementRegister } from '@/lib/inventory-movement-queries'

export const metadata: Metadata = { title: 'Stock Movement register' }

function money(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export default async function StockMovementRegisterPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'inventory.read')
  const rows = await getStockMovementRegister(profile.tenantId)

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Inventory / Evidence register</p>
          <h1 className="page-title">Stock Movements</h1>
          <p className="page-subtitle">
            Transfers, project consumption, and count adjustments remain
            traceable through posting and reversal.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/inventory" className="finance-secondary-link">
            Inventory
          </Link>
          {can(profile.role, 'inventory.manage') && (
            <Link
              href="/inventory/movements/new"
              className="finance-primary-link"
            >
              New Stock Movement
            </Link>
          )}
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Movement register</p>
            <h2>Operational and valuation evidence</h2>
          </div>
          <p>Posted history is corrected by reversal, never edited away.</p>
        </div>
        <div className="finance-table-shell">
          {rows.length === 0 ? (
            <div className="card-empty">
              <p>No Stock Movements yet.</p>
              {can(profile.role, 'inventory.manage') && (
                <Link href="/inventory/movements/new">
                  Prepare the first movement
                </Link>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Movement</th>
                  <th>Type</th>
                  <th>Warehouse path</th>
                  <th>Project / reason</th>
                  <th>Date</th>
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
                        href={`/inventory/movements/${row.id}`}
                        className="finance-entry-link"
                      >
                        {row.internal_number ?? 'Draft movement'}
                      </Link>
                    </td>
                    <td>{row.movement_type.replaceAll('_', ' ')}</td>
                    <td>
                      {row.source_code}
                      {row.target_code ? ` → ${row.target_code}` : ''}
                    </td>
                    <td>
                      {row.project_name ?? 'No Project'}
                      <span className="finance-cell-detail">
                        {row.reason}
                      </span>
                    </td>
                    <td>{row.movement_date}</td>
                    <td>{row.line_count}</td>
                    <td>
                      <span
                        className={`finance-status finance-status-${row.status}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="numeric">
                      {row.status === 'draft'
                        ? 'Pending valuation'
                        : money(row.total_value_cents)}
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
