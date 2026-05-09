import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { invoices, projects, users } from '@buildops/database/schema'
import { and, eq } from 'drizzle-orm'
import { InvoiceStatusActions } from './invoice-status-actions'

export const metadata: Metadata = { title: 'Invoice' }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partial_payment: 'Partial Payment',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  issued: '#3b82f6',
  partial_payment: '#f59e0b',
  paid: '#10b981',
  overdue: '#ef4444',
  cancelled: '#6b7280',
}

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

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
      project_id: invoices.project_id,
    })
    .from(invoices)
    .leftJoin(projects, eq(invoices.project_id, projects.id))
    .where(and(eq(invoices.id, id), eq(invoices.tenant_id, userRow.tenant_id)))

  if (!inv) return notFound()

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Link href="/invoices" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          Invoices
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>{inv.invoice_number}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '16px 0 24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px', color: 'var(--color-neutral-900)', fontFamily: 'JetBrains Mono, monospace' }}>
            {inv.invoice_number}
          </h1>
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
            {inv.project_id && (
              <Link href={`/projects/${inv.project_id}`} style={{ color: 'var(--color-navy-700)', textDecoration: 'none' }}>
                {inv.project_name}
              </Link>
            )}
            <span>Created {new Date(inv.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: STATUS_COLORS[inv.status] ?? '#9ca3af',
              background: `${STATUS_COLORS[inv.status] ?? '#9ca3af'}18`,
              border: `1px solid ${STATUS_COLORS[inv.status] ?? '#9ca3af'}40`,
            }}
          >
            {STATUS_LABELS[inv.status] ?? inv.status}
          </span>
          <InvoiceStatusActions invoiceId={id} currentStatus={inv.status} />
        </div>
      </div>

      {/* Financial breakdown */}
      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '16px',
          maxWidth: '420px',
        }}
      >
        <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
          Billing Summary
        </h3>
        <dl style={{ margin: 0 }}>
          {[
            { label: `Billing (${(inv.billing_percent_bps / 100).toFixed(0)}% of TCV)`, value: formatPHP(inv.subtotal_cents) },
            { label: `Retention (${(inv.retention_bps / 100).toFixed(0)}%)`, value: `(${formatPHP(inv.retention_cents)})`, color: '#f59e0b' },
            { label: 'VAT (12%)', value: `+${formatPHP(inv.vat_cents)}` },
            { label: 'Withholding Tax (2%)', value: `−${formatPHP(inv.withholding_tax_cents)}` },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <dt style={{ fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>{label}</dt>
              <dd style={{ fontSize: '0.875rem', color: color ?? 'var(--color-neutral-700)', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{value}</dd>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
            <dt style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-neutral-800)' }}>Net Amount Due</dt>
            <dd style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-neutral-900)', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
              {formatPHP(inv.net_amount_cents)}
            </dd>
          </div>
        </dl>

        {/* Dates */}
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
          {inv.due_date && (
            <div style={{ fontSize: '0.875rem', color: 'var(--color-neutral-500)', marginBottom: '6px' }}>
              Due{' '}
              <strong style={{ color: 'var(--color-neutral-800)' }}>
                {new Date(inv.due_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </strong>
            </div>
          )}
          {inv.paid_at && (
            <div style={{ fontSize: '0.875rem', color: '#10b981' }}>
              Paid {new Date(inv.paid_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      {inv.notes && (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
            Notes
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-700)', margin: 0, lineHeight: 1.6 }}>{inv.notes}</p>
        </div>
      )}
    </div>
  )
}
