import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { poLineItems, projects, purchaseOrders, tenants, vendors } from '@third-code-erp/database/schema'
import { and, asc, eq } from 'drizzle-orm'
import { PrintButton } from './print-button'

export const metadata: Metadata = { title: 'Purchase Order' }

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function PoPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await getUserProfile()
  if (!profile) return notFound()

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
    .leftJoin(
      projects,
      and(eq(purchaseOrders.project_id, projects.id), eq(projects.tenant_id, profile.tenantId)),
    )
    .leftJoin(
      vendors,
      and(eq(purchaseOrders.vendor_id, vendors.id), eq(vendors.tenant_id, profile.tenantId)),
    )
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return notFound()

  const lineItems = await db
    .select()
    .from(poLineItems)
    .where(and(eq(poLineItems.po_id, id), eq(poLineItems.tenant_id, profile.tenantId)))
    .orderBy(asc(poLineItems.sort_order))

  const [tenant] = await db
    .select({ name: tenants.name, bir_tin: tenants.bir_tin, pcab_license: tenants.pcab_license })
    .from(tenants)
    .where(eq(tenants.id, profile.tenantId))

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', background: '#f3f4f6' }}>
      {/* Toolbar */}
      <div
        className="no-print"
        style={{ position: 'fixed', top: '24px', right: '24px', display: 'flex', gap: '8px', zIndex: 50 }}
      >
        <Link
          href={`/purchase-orders/${id}`}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 500,
            background: 'white',
            color: '#374151',
            border: '1px solid #d1d5db',
            textDecoration: 'none',
          }}
        >
          ← Back
        </Link>
        <PrintButton />
      </div>

      {/* A4 document */}
      <div
        style={{
          background: 'white',
          width: '210mm',
          minHeight: '297mm',
          padding: '20mm 20mm 24mm',
          boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
          fontSize: '13px',
          lineHeight: 1.5,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', borderBottom: '2px solid #1F3864', paddingBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#1F3864', letterSpacing: '-0.02em', marginBottom: '4px' }}>
              {tenant?.name ?? 'ABI OPS'}
            </div>
            {tenant?.bir_tin && (
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>
                BIR TIN: <strong style={{ color: '#374151', fontFamily: 'monospace' }}>{tenant.bir_tin}</strong>
              </div>
            )}
            {tenant?.pcab_license && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                PCAB License: <strong style={{ color: '#374151' }}>{tenant.pcab_license}</strong>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              Purchase Order
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace', color: '#1F3864', marginBottom: '4px' }}>
              {po.po_number}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Date: <strong style={{ color: '#374151' }}>{formatDate(po.created_at)}</strong>
            </div>
            {po.delivery_date && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Expected Delivery: <strong style={{ color: '#374151' }}>{formatDate(po.delivery_date)}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Vendor and project info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '28px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Supplier / Vendor
            </div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827', marginBottom: '2px' }}>
              {po.vendor_name ?? 'TBD'}
            </div>
            {po.vendor_contact && <div style={{ fontSize: '12px', color: '#6b7280' }}>{po.vendor_contact}</div>}
            {po.vendor_email && <div style={{ fontSize: '12px', color: '#6b7280' }}>{po.vendor_email}</div>}
            {po.vendor_phone && <div style={{ fontSize: '12px', color: '#6b7280' }}>{po.vendor_phone}</div>}
            {po.vendor_tin && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                TIN: <span style={{ fontFamily: 'monospace' }}>{po.vendor_tin}</span>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              For Project
            </div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827' }}>
              {po.project_name ?? '—'}
            </div>
          </div>
        </div>

        {/* Line items table */}
        {lineItems.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1F3864', color: 'white' }}>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Code</th>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600 }}>Description</th>
                <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600 }}>Unit</th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>Qty</th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>Unit Price</th>
                <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, i) => (
                <tr key={line.id} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 1 ? '#f9fafb' : 'white' }}>
                  <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: '#6b7280', fontSize: '11px' }}>
                    {line.code ?? '—'}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#374151' }}>{line.description}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: '#6b7280' }}>{line.unit ?? '—'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{line.quantity}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatPHP(line.unit_cost_cents)}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                    {formatPHP(line.line_total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid #d1d5db', background: '#f9fafb' }}>
                <td colSpan={5} style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontSize: '12px' }}>Subtotal</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#111827' }}>{formatPHP(po.subtotal_cents)}</td>
              </tr>
              <tr style={{ background: '#f9fafb' }}>
                <td colSpan={5} style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontSize: '12px' }}>VAT (12%)</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#111827' }}>{formatPHP(po.vat_cents)}</td>
              </tr>
              {po.withholding_tax_cents > 0 && (
                <tr style={{ background: '#fef2f2' }}>
                  <td colSpan={5} style={{ padding: '10px 12px', textAlign: 'right', color: '#7f1d1d', fontSize: '12px' }}>
                    Less: Withholding Tax (2%)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#7f1d1d' }}>
                    ({formatPHP(po.withholding_tax_cents)})
                  </td>
                </tr>
              )}
              <tr style={{ background: '#1F3864', color: 'white' }}>
                <th colSpan={5} style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>TOTAL AMOUNT</th>
                <th style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', fontSize: '15px' }}>
                  {formatPHP(po.total_cents)}
                </th>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '20px', textAlign: 'center', color: '#9ca3af', marginBottom: '24px', fontSize: '12px' }}>
            No line items.
          </div>
        )}

        {/* Notes */}
        {po.notes && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Notes / Special Instructions
            </div>
            <p style={{ color: '#374151', margin: 0, lineHeight: 1.6, fontSize: '13px' }}>{po.notes}</p>
          </div>
        )}

        {/* Terms */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '14px 16px', marginBottom: '32px', fontSize: '12px', color: '#374151' }}>
          <strong>Terms &amp; Conditions:</strong> All items must be delivered in accordance with the specifications stated herein.
          Payment is subject to 2% creditable withholding tax per BIR regulations. Please attach BIR Form 2307 upon billing.
        </div>

        {/* Signature block */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '32px' }}>
          <div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: '8px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Authorized by</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{tenant?.name ?? 'ABI OPS'}</div>
            </div>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: '8px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Supplier acknowledgement</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Date: _______________</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '40px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', textAlign: 'center', fontSize: '11px', color: '#9ca3af' }}>
          This purchase order is system-generated by ABI OPS. PO {po.po_number} dated {formatDate(po.created_at)}.
        </div>
      </div>
    </div>
  )
}
