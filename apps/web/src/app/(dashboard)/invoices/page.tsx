import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { invoices, projects } from '@third-code-erp/database/schema'
import { eq, desc } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Invoices' }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partial_payment: 'Partial',
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
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function InvoicesPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')

  const rows = await db
    .select({
      id: invoices.id,
      invoice_number: invoices.invoice_number,
      status: invoices.status,
      billing_percent_bps: invoices.billing_percent_bps,
      subtotal_cents: invoices.subtotal_cents,
      retention_cents: invoices.retention_cents,
      vat_cents: invoices.vat_cents,
      net_amount_cents: invoices.net_amount_cents,
      due_date: invoices.due_date,
      paid_at: invoices.paid_at,
      issuance_journal_entry_id: invoices.issuance_journal_entry_id,
      created_at: invoices.created_at,
      project_name: projects.name,
      project_id: projects.id,
    })
    .from(invoices)
    .leftJoin(projects, eq(invoices.project_id, projects.id))
    .where(eq(invoices.tenant_id, profile.tenantId))
    .orderBy(desc(invoices.created_at))

  const totalIssued = rows
    .filter(
      (row) =>
        Boolean(row.issuance_journal_entry_id) &&
        ['issued', 'partial_payment', 'overdue'].includes(row.status)
    )
    .reduce((s, r) => s + r.net_amount_cents, 0)
  const totalDraft = rows
    .filter((row) => row.status === 'draft')
    .reduce((s, r) => s + r.net_amount_cents, 0)
  const postedCount = rows.filter((row) =>
    Boolean(row.issuance_journal_entry_id)
  ).length

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">
            Prepare project billing, then issue it into the ledger once.
          </p>
        </div>
        <Link href="/finance/receivables" className="finance-secondary-link">
          Open receivables
        </Link>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { label: 'Posted open', value: formatPHP(totalIssued), color: '#3b82f6' },
          { label: 'Draft value', value: formatPHP(totalDraft), color: '#64748b' },
          { label: 'Posted invoices', value: String(postedCount), color: '#10b981' },
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
          <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>No invoices yet.</p>
          <p style={{ fontSize: '0.8125rem' }}>
            Invoices are generated from project billing milestones.{' '}
            <Link href="/projects" style={{ color: 'var(--color-navy-700)' }}>
              Go to Projects
            </Link>
          </p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Project</th>
                <th>Status</th>
                <th className="numeric">Billing %</th>
                <th className="numeric">Subtotal</th>
                <th className="numeric">Retention</th>
                <th className="numeric">Net Amount</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      href={`/invoices/${row.id}`}
                      style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-navy-700)', textDecoration: 'none' }}
                    >
                      {row.invoice_number}
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
                    {(row.billing_percent_bps / 100).toFixed(0)}%
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {formatPHP(row.subtotal_cents)}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#f59e0b' }}>
                    ({formatPHP(row.retention_cents)})
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}>
                    {formatPHP(row.net_amount_cents)}
                  </td>
                  <td style={{ color: 'var(--color-neutral-500)', fontSize: '0.8125rem' }}>
                    {row.due_date
                      ? new Date(row.due_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          marginTop: '24px',
          background: 'var(--color-navy-50)',
          border: '1px solid var(--color-navy-100)',
          borderRadius: '8px',
          padding: '16px 20px',
          fontSize: '0.8125rem',
          color: 'var(--color-navy-700)',
        }}
      >
        Drafts have no ledger effect. “Issue and post” creates the immutable
        receivable, retention, withholding-tax, revenue, and output-VAT lines
        in one transaction.
      </div>
    </div>
  )
}
