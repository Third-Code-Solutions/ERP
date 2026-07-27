import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Stock Movement register' }

interface MovementRow {
  [key: string]: unknown
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

function money(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export default async function StockMovementRegisterPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'inventory.read')
  const rawRows = await db.execute<MovementRow>(sql`
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
    where movement.tenant_id = ${profile.tenantId}::uuid
    group by movement.id, source.id, target.id, project.id
    order by movement.movement_date desc, movement.created_at desc
  `)
  const rows = rawRows.map((row) => ({
    ...row,
    line_count: Number(row.line_count),
    total_value_cents: Number(row.total_value_cents),
  }))

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
