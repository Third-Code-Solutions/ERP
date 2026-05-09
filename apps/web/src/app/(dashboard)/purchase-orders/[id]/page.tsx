import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { poLineItems, projects, purchaseOrders, users, vendors } from '@buildops/database/schema'
import { and, asc, eq } from 'drizzle-orm'
import { PoStatusActions } from './po-status-actions'

export const metadata: Metadata = { title: 'Purchase Order' }

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
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      po_number: purchaseOrders.po_number,
      status: purchaseOrders.status,
      subtotal_cents: purchaseOrders.subtotal_cents,
      vat_cents: purchaseOrders.vat_cents,
      withholding_tax_cents: purchaseOrders.withholding_tax_cents,
      total_cents: purchaseOrders.total_cents,
      delivery_date: purchaseOrders.delivery_date,
      notes: purchaseOrders.notes,
      created_at: purchaseOrders.created_at,
      project_name: projects.name,
      project_id: purchaseOrders.project_id,
      vendor_name: vendors.name,
      vendor_contact: vendors.contact_name,
      vendor_email: vendors.email,
      vendor_phone: vendors.phone,
      vendor_tin: vendors.bir_tin,
    })
    .from(purchaseOrders)
    .leftJoin(projects, eq(purchaseOrders.project_id, projects.id))
    .leftJoin(vendors, eq(purchaseOrders.vendor_id, vendors.id))
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenant_id, userRow.tenant_id)))

  if (!po) return notFound()

  const lines = await db
    .select()
    .from(poLineItems)
    .where(and(eq(poLineItems.po_id, id), eq(poLineItems.tenant_id, userRow.tenant_id)))
    .orderBy(asc(poLineItems.sort_order))

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Link href="/purchase-orders" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          Purchase Orders
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>{po.po_number}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '16px 0 24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px', color: 'var(--color-neutral-900)', fontFamily: 'JetBrains Mono, monospace' }}>
            {po.po_number}
          </h1>
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
            {po.project_id && (
              <Link href={`/projects/${po.project_id}`} style={{ color: 'var(--color-navy-700)', textDecoration: 'none' }}>
                {po.project_name}
              </Link>
            )}
            <span>Created {new Date(po.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: STATUS_COLORS[po.status] ?? '#9ca3af',
              background: `${STATUS_COLORS[po.status] ?? '#9ca3af'}18`,
              border: `1px solid ${STATUS_COLORS[po.status] ?? '#9ca3af'}40`,
            }}
          >
            {STATUS_LABELS[po.status] ?? po.status}
          </span>
          <PoStatusActions poId={id} currentStatus={po.status} />
        </div>
      </div>

      {/* Two-column meta + vendor */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Financial summary */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
            Financials
          </h3>
          <dl style={{ margin: 0 }}>
            {[
              { label: 'Subtotal', value: formatPHP(po.subtotal_cents) },
              { label: 'VAT (12%)', value: `+${formatPHP(po.vat_cents)}` },
              { label: 'Withholding Tax (2%)', value: `−${formatPHP(po.withholding_tax_cents)}` },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <dt style={{ fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>{label}</dt>
                <dd style={{ fontSize: '0.875rem', color: 'var(--color-neutral-700)', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{value}</dd>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <dt style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-neutral-800)' }}>Total</dt>
              <dd style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-neutral-900)', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
                {formatPHP(po.total_cents)}
              </dd>
            </div>
          </dl>
          {po.delivery_date && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)', fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
              Delivery by{' '}
              <strong style={{ color: 'var(--color-neutral-800)' }}>
                {new Date(po.delivery_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </strong>
            </div>
          )}
        </div>

        {/* Vendor info */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
            Vendor
          </h3>
          {po.vendor_name ? (
            <dl style={{ margin: 0 }}>
              {[
                { label: 'Name', value: po.vendor_name },
                { label: 'Contact', value: po.vendor_contact },
                { label: 'Email', value: po.vendor_email },
                { label: 'Phone', value: po.vendor_phone },
                { label: 'BIR TIN', value: po.vendor_tin },
              ]
                .filter(({ value }) => value)
                .map(({ label, value }) => (
                  <div key={label} style={{ marginBottom: '10px' }}>
                    <dt style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                      {label}
                    </dt>
                    <dd style={{ fontSize: '0.875rem', color: 'var(--color-neutral-800)', margin: 0 }}>{value}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-400)', margin: 0 }}>
              No vendor assigned.{' '}
              <Link href="/procurement" style={{ color: 'var(--color-navy-700)' }}>
                Manage vendors →
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Line items */}
      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-800)', margin: 0 }}>
            Line Items ({lines.length})
          </h2>
        </div>

        {lines.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.875rem' }}>
            No line items
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)' }}>
                {['#', 'Code', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Line Total'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px',
                      textAlign: i >= 3 ? 'right' : 'left',
                      fontWeight: 600,
                      color: 'var(--color-neutral-600)',
                      fontSize: '0.8125rem',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr
                  key={line.id}
                  style={{ borderBottom: idx < lines.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                >
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-400)', fontSize: '0.8125rem', width: 40 }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-500)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>
                    {line.code ?? '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-800)', fontWeight: 500 }}>
                    {line.description}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                    {line.quantity.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--color-neutral-500)' }}>
                    {line.unit ?? '—'}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-neutral-700)' }}>
                    {formatPHP(line.unit_cost_cents)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
                    {formatPHP(line.line_total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-neutral-50)' }}>
                <td colSpan={6} style={{ padding: '12px 16px', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-neutral-700)', textAlign: 'right' }}>
                  Total
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-neutral-900)' }}>
                  {formatPHP(lines.reduce((s, l) => s + l.line_total_cents, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {po.notes && (
        <div
          style={{
            marginTop: '16px',
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
            Notes
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-700)', margin: 0, lineHeight: 1.6 }}>{po.notes}</p>
        </div>
      )}
    </div>
  )
}
