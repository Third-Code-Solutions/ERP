import type { Metadata } from 'next'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { purchaseOrders, projects, vendors, users, boms } from '@buildops/database/schema'
import { eq, desc, and, inArray } from 'drizzle-orm'
import { CreatePoForm } from '@/components/procurement/create-po-form'
import { GeneratePosTrigger } from '@/components/procurement/generate-pos-trigger'

export const metadata: Metadata = { title: 'Purchase Orders' }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  partial_delivery: 'Partial Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  submitted: '#3b82f6',
  confirmed: '#8b5cf6',
  partial_delivery: '#f59e0b',
  delivered: '#10b981',
  cancelled: '#ef4444',
}

function formatPHP(cents: number): string {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function PurchaseOrdersPage() {
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))

  if (!userRow?.tenant_id) return null

  const [projectList, vendorList, eligibleBomRows] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.tenant_id, userRow.tenant_id)).orderBy(projects.name),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(eq(vendors.tenant_id, userRow.tenant_id)).orderBy(vendors.name),
    db
      .select({
        id: boms.id,
        version: boms.version,
        status: boms.status,
        total_cost_cents: boms.total_cost_cents,
        project_name: projects.name,
      })
      .from(boms)
      .leftJoin(projects, eq(boms.project_id, projects.id))
      .where(and(eq(boms.tenant_id, userRow.tenant_id), inArray(boms.status, ['approved', 'locked'])))
      .orderBy(desc(boms.created_at)),
  ])

  const eligibleBoms = eligibleBomRows.map((b) => ({
    id: b.id,
    version: b.version,
    status: b.status,
    total_cost_cents: b.total_cost_cents,
    project_name: b.project_name ?? '—',
  }))

  const rows = await db
    .select({
      id: purchaseOrders.id,
      po_number: purchaseOrders.po_number,
      status: purchaseOrders.status,
      subtotal_cents: purchaseOrders.subtotal_cents,
      vat_cents: purchaseOrders.vat_cents,
      total_cents: purchaseOrders.total_cents,
      delivery_date: purchaseOrders.delivery_date,
      created_at: purchaseOrders.created_at,
      project_name: projects.name,
      project_id: projects.id,
      vendor_name: vendors.name,
      vendor_id: vendors.id,
    })
    .from(purchaseOrders)
    .leftJoin(projects, eq(purchaseOrders.project_id, projects.id))
    .leftJoin(vendors, eq(purchaseOrders.vendor_id, vendors.id))
    .where(eq(purchaseOrders.tenant_id, userRow.tenant_id))
    .orderBy(desc(purchaseOrders.created_at))

  const totalCommitted = rows
    .filter((r) => ['submitted', 'confirmed', 'partial_delivery'].includes(r.status))
    .reduce((s, r) => s + r.total_cents, 0)
  const totalDelivered = rows
    .filter((r) => r.status === 'delivered')
    .reduce((s, r) => s + r.total_cents, 0)
  const pendingDelivery = rows
    .filter((r) => r.status === 'partial_delivery')
    .reduce((s, r) => s + r.total_cents, 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p className="page-subtitle">{rows.length} PO{rows.length !== 1 ? 's' : ''} across all projects</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <GeneratePosTrigger boms={eligibleBoms} />
          <CreatePoForm projects={projectList} vendors={vendorList} />
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { label: 'Committed', value: formatPHP(totalCommitted), color: '#8b5cf6' },
          { label: 'Delivered', value: formatPHP(totalDelivered), color: '#10b981' },
          { label: 'Partial Delivery', value: formatPHP(pendingDelivery), color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '14px 20px',
              minWidth: '180px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              {label}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '64px 24px',
            textAlign: 'center',
            color: 'var(--color-neutral-400)',
          }}
        >
          <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>No purchase orders yet.</p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-400)' }}>
            Create a PO directly using the button above, or generate one from an approved BOM.
          </p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Project</th>
                <th>Vendor</th>
                <th>Status</th>
                <th className="numeric">Subtotal</th>
                <th className="numeric">VAT</th>
                <th className="numeric">Total</th>
                <th>Delivery Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      href={`/purchase-orders/${row.id}`}
                      style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-navy-700)', textDecoration: 'none' }}
                    >
                      {row.po_number}
                    </Link>
                  </td>
                  <td>
                    {row.project_id ? (
                      <Link
                        href={`/projects/${row.project_id}`}
                        style={{ color: 'var(--color-navy-700)', textDecoration: 'none', fontSize: '0.875rem' }}
                      >
                        {row.project_name ?? '—'}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--color-neutral-700)' }}>
                    {row.vendor_name ?? <span style={{ color: 'var(--color-neutral-400)' }}>—</span>}
                  </td>
                  <td>
                    <span
                      className="stage-badge"
                      style={{
                        color: STATUS_COLORS[row.status] ?? '#9ca3af',
                        background: (STATUS_COLORS[row.status] ?? '#9ca3af') + '18',
                      }}
                    >
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {formatPHP(row.subtotal_cents)}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-neutral-500)' }}>
                    {formatPHP(row.vat_cents)}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}>
                    {formatPHP(row.total_cents)}
                  </td>
                  <td style={{ color: 'var(--color-neutral-500)', fontSize: '0.8125rem' }}>
                    {row.delivery_date
                      ? new Date(row.delivery_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
