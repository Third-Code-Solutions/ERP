import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  invoices,
  projects,
} from '@third-code-erp/database/schema'
import { and, eq, sql } from 'drizzle-orm'
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

interface ReceiptAllocationRow extends Record<string, unknown> {
  transaction_id: string
  transaction_number: string
  reference_number: string
  status: 'draft' | 'posted' | 'reversed'
  allocation_type: 'customer_current_due' | 'customer_retention'
  transaction_date: string
  amount_cents: number
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  const canIssueInvoice = can(profile.role, 'finance.issue_invoice')
  const canManageCash = can(profile.role, 'finance.manage_cash')

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
      account_id: sql<string | null>`coalesce(
        ${invoices.account_id},
        ${projects.account_id}
      )`,
      account_name: accounts.name,
      issued_at: invoices.issued_at,
      issuance_journal_entry_id: invoices.issuance_journal_entry_id,
      reversed_at: invoices.reversed_at,
      reversal_reason: invoices.reversal_reason,
      reversal_journal_entry_id: invoices.reversal_journal_entry_id,
      notes: invoices.notes,
      created_at: invoices.created_at,
      project_name: projects.name,
      project_id: invoices.project_id,
    })
    .from(invoices)
    .leftJoin(
      projects,
      and(
        eq(invoices.project_id, projects.id),
        eq(invoices.tenant_id, projects.tenant_id)
      )
    )
    .leftJoin(
      accounts,
      and(
        eq(
          accounts.id,
          sql`coalesce(${invoices.account_id}, ${projects.account_id})`
        ),
        eq(invoices.tenant_id, accounts.tenant_id)
      )
    )
    .where(
      and(eq(invoices.id, id), eq(invoices.tenant_id, profile.tenantId))
    )

  if (!inv) return notFound()

  const receiptAllocations = await db.execute<ReceiptAllocationRow>(sql`
    select
      cash_tx.id as transaction_id,
      coalesce(cash_tx.internal_number, cash_tx.reference_number)
        as transaction_number,
      cash_tx.reference_number,
      cash_tx.status,
      allocation.allocation_type,
      cash_tx.transaction_date,
      allocation.amount_cents
    from public.cash_allocations allocation
    join public.cash_transactions cash_tx
      on cash_tx.id = allocation.cash_transaction_id
     and cash_tx.tenant_id = allocation.tenant_id
    where allocation.invoice_id = ${inv.id}::uuid
      and allocation.tenant_id = ${profile.tenantId}::uuid
    order by cash_tx.transaction_date desc, allocation.line_number
  `)
  const activeCurrent = receiptAllocations
    .filter(
      (allocation) =>
        allocation.status === 'posted' &&
        allocation.allocation_type === 'customer_current_due'
    )
    .reduce(
      (sum, allocation) => sum + Number(allocation.amount_cents),
      0
    )
  const activeRetention = receiptAllocations
    .filter(
      (allocation) =>
        allocation.status === 'posted' &&
        allocation.allocation_type === 'customer_retention'
    )
    .reduce(
      (sum, allocation) => sum + Number(allocation.amount_cents),
      0
    )

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
            {inv.account_id && (
              <Link
                href={`/crm/accounts/${inv.account_id}`}
                style={{ color: 'var(--color-navy-700)', textDecoration: 'none' }}
              >
                {inv.account_name}
              </Link>
            )}
            <span>Created {new Date(inv.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
        <div className="invoice-detail-actions">
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
          {canIssueInvoice && (
            <InvoiceStatusActions
              invoiceId={id}
              currentStatus={inv.status}
              defaultPostingDate={new Date().toISOString().slice(0, 10)}
            />
          )}
          <Link
            href={`/invoices/${id}/print`}
            target="_blank"
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              fontWeight: 500,
              border: '1px solid var(--color-border)',
              background: 'white',
              color: 'var(--color-neutral-700)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Print / PDF
          </Link>
          <Link
            href={`/invoices/${id}/bir2307`}
            target="_blank"
            title="Generate BIR Form 2307 — Certificate of Creditable Tax Withheld at Source"
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              fontWeight: 500,
              border: '1px solid var(--color-border)',
              background: 'white',
              color: 'var(--color-neutral-700)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            BIR 2307
          </Link>
        </div>
      </div>

      {inv.issuance_journal_entry_id && (
        <div className="finance-callout invoice-posting-proof">
          <div>
            <strong>Posted financial record</strong>
            <span>
              Issued{' '}
              {inv.issued_at
                ? new Date(inv.issued_at).toLocaleDateString('en-PH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'through the general ledger'}
              . Commercial and monetary terms are now immutable.
            </span>
          </div>
          <Link href={`/finance/journals/${inv.issuance_journal_entry_id}`}>
            View journal
          </Link>
        </div>
      )}

      {inv.reversal_journal_entry_id && (
        <div className="finance-callout invoice-posting-proof invoice-reversal-proof">
          <div>
            <strong>Invoice reversed</strong>
            <span>
              {inv.reversed_at
                ? new Date(inv.reversed_at).toLocaleDateString('en-PH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Posted correction'}
              {' · '}
              {inv.reversal_reason}
            </span>
          </div>
          <Link href={`/finance/journals/${inv.reversal_journal_entry_id}`}>
            View reversal
          </Link>
        </div>
      )}

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

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Settlement evidence</p>
            <h2>Receipt allocations</h2>
          </div>
          <p>
            Current open{' '}
            {formatPHP(Math.max(inv.net_amount_cents - activeCurrent, 0))}
            {' · '}Retention open{' '}
            {formatPHP(Math.max(inv.retention_cents - activeRetention, 0))}
          </p>
        </div>
        <div className="finance-table-shell">
          {receiptAllocations.length === 0 ? (
            <div className="card-empty">
              <p>No receipt has been allocated to this invoice.</p>
              {canManageCash && <Link href="/finance/cash/new">Record receipt</Link>}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Component</th>
                  <th>Status</th>
                  <th className="numeric">Amount</th>
                </tr>
              </thead>
              <tbody>
                {receiptAllocations.map((allocation, index) => (
                  <tr
                    key={`${allocation.transaction_id}:${allocation.allocation_type}:${index}`}
                  >
                    <td>
                      <Link href={`/finance/cash/${allocation.transaction_id}`}>
                        {allocation.transaction_number}
                      </Link>
                      <span className="finance-cell-detail">
                        Ref {allocation.reference_number}
                      </span>
                    </td>
                    <td>{allocation.transaction_date}</td>
                    <td>{allocation.allocation_type.replaceAll('_', ' ')}</td>
                    <td>
                      <span
                        className={`finance-status finance-status-${allocation.status}`}
                      >
                        {allocation.status}
                      </span>
                    </td>
                    <td className="numeric">
                      {formatPHP(Number(allocation.amount_cents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

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
