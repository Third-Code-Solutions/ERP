import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { invoices, projects, tenants } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { PrintButton } from './print-button'

export const metadata: Metadata = { title: 'Invoice' }

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getUserProfile()
  if (!profile) return notFound()

  const [inv] = await db
    .select({
      id: invoices.id,
      invoice_number: invoices.invoice_number,
      status: invoices.status,
      billing_percent_bps: invoices.billing_percent_bps,
      retention_bps: invoices.retention_bps,
      subtotal_cents: invoices.subtotal_cents,
      retention_cents: invoices.retention_cents,
      vat_cents: invoices.vat_cents,
      withholding_tax_cents: invoices.withholding_tax_cents,
      net_amount_cents: invoices.net_amount_cents,
      due_date: invoices.due_date,
      paid_at: invoices.paid_at,
      notes: invoices.notes,
      created_at: invoices.created_at,
      project_name: projects.name,
      project_client: projects.client,
      project_location: projects.location,
      project_id: invoices.project_id,
    })
    .from(invoices)
    .leftJoin(
      projects,
      and(eq(invoices.project_id, projects.id), eq(projects.tenant_id, profile.tenantId)),
    )
    .where(and(eq(invoices.id, id), eq(invoices.tenant_id, profile.tenantId)))

  if (!inv) return notFound()

  const [tenant] = await db
    .select({ name: tenants.name, bir_tin: tenants.bir_tin, pcab_license: tenants.pcab_license })
    .from(tenants)
    .where(eq(tenants.id, profile.tenantId))

  const billingPct = (inv.billing_percent_bps / 100).toFixed(0)
  const retentionPct = (inv.retention_bps / 100).toFixed(0)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', background: '#f3f4f6' }}>
      {/* Toolbar — hidden when printing */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          display: 'flex',
          gap: '8px',
          zIndex: 50,
        }}
      >
        <Link
          href={`/invoices/${id}`}
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

      {/* A4 invoice document */}
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
            <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'monospace', color: '#1F3864', marginBottom: '4px' }}>
              {inv.invoice_number}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Date: <strong style={{ color: '#374151' }}>{formatDate(inv.created_at)}</strong>
            </div>
            {inv.due_date && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Due: <strong style={{ color: inv.status === 'overdue' ? '#dc2626' : '#374151' }}>{formatDate(inv.due_date)}</strong>
              </div>
            )}
            {inv.paid_at && (
              <div style={{ fontSize: '12px', color: '#15803d', marginTop: '4px', fontWeight: 600 }}>
                PAID — {formatDate(inv.paid_at)}
              </div>
            )}
          </div>
        </div>

        {/* Billed to */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
            Billed To
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827', marginBottom: '2px' }}>
            {inv.project_client ?? '—'}
          </div>
          <div style={{ color: '#6b7280', fontSize: '13px' }}>
            Re: {inv.project_name ?? '—'}
          </div>
          {inv.project_location && (
            <div style={{ color: '#6b7280', fontSize: '13px' }}>{inv.project_location}</div>
          )}
        </div>

        {/* Description row */}
        <div
          style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            padding: '16px 20px',
            marginBottom: '24px',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
            Description
          </div>
          <div style={{ fontWeight: 600, color: '#111827' }}>
            Progress Billing — {billingPct}% of Contract Value
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
            Project: {inv.project_name ?? '—'}
          </div>
        </div>

        {/* Financial table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#1F3864', color: 'white' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>Item</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>Amount (PHP)</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '12px 16px', color: '#374151' }}>
                Contract Progress Billing ({billingPct}% of TCV)
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#111827' }}>
                {formatPHP(inv.subtotal_cents)}
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fffbeb' }}>
              <td style={{ padding: '12px 16px', color: '#92400e' }}>
                Less: Retention ({retentionPct}%)
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#92400e' }}>
                ({formatPHP(inv.retention_cents)})
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '12px 16px', color: '#374151' }}>
                Add: Value Added Tax (12% VAT)
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#111827' }}>
                {formatPHP(inv.vat_cents)}
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
              <td style={{ padding: '12px 16px', color: '#7f1d1d' }}>
                Less: Creditable Withholding Tax (2% — BIR Form 2307)
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#7f1d1d' }}>
                ({formatPHP(inv.withholding_tax_cents)})
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ background: '#1F3864', color: 'white' }}>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, fontSize: '14px' }}>
                NET AMOUNT DUE
              </th>
              <th style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', fontSize: '16px' }}>
                {formatPHP(inv.net_amount_cents)}
              </th>
            </tr>
          </tfoot>
        </table>

        {/* BIR 2307 notice */}
        <div
          style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '6px',
            padding: '14px 16px',
            marginBottom: '24px',
            fontSize: '12px',
            color: '#0369a1',
          }}
        >
          <strong>BIR 2307 Notice:</strong> The withheld amount of {formatPHP(inv.withholding_tax_cents)} (2% creditable withholding tax)
          shall be remitted to the BIR by the withholding agent. Certificate of Creditable Tax Withheld (BIR Form 2307)
          must be issued to the payee upon each payment.
        </div>

        {/* Notes */}
        {inv.notes && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Notes
            </div>
            <p style={{ color: '#374151', margin: 0, lineHeight: 1.6 }}>{inv.notes}</p>
          </div>
        )}

        {/* Signature block */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '48px' }}>
          <div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: '8px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Prepared and issued by</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{tenant?.name ?? 'ABI OPS'}</div>
            </div>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: '8px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Received by / Client signature</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Date: _______________</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '40px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', textAlign: 'center', fontSize: '11px', color: '#9ca3af' }}>
          This invoice is system-generated by ABI OPS. Invoice {inv.invoice_number} is issued pursuant to applicable BIR regulations.
        </div>
      </div>
    </div>
  )
}
