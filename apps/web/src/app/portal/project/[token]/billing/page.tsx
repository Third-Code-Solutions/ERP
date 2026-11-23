import type { Metadata } from 'next'
import React from 'react'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  cashAllocations,
  cashTransactions,
  invoices,
  progressClaims,
  projects,
  accounts,
} from '@third-code-erp/database/schema'
import {
  findActiveCustomerSession,
  logCustomerView,
} from '@/lib/operations/customer-portal'
import {
  PORTAL_CLAIM_STATUSES,
  PORTAL_INVOICE_STATUSES,
  portalBillingTotals,
} from './billing-view'

export const metadata: Metadata = {
  title: 'Project billing',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partial_payment: 'Partial',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

const INVOICE_STATUS_TONES: Record<string, string> = {
  draft: '#9ca3af',
  issued: '#1f4ea1',
  partial_payment: '#7a4a00',
  paid: '#0d5c3a',
  overdue: '#a01818',
  cancelled: '#4b5563',
}

const CLAIM_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  certificate_pending: 'Certificate pending',
  certified: 'Certified',
  handed_over_finance: 'With finance',
  invoiced: 'Invoiced',
  paid: 'Paid',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const CLAIM_STATUS_TONES: Record<string, string> = {
  draft: '#9ca3af',
  submitted: '#1f4ea1',
  certificate_pending: '#7a4a00',
  certified: '#0d5c3a',
  handed_over_finance: '#0F2D4A',
  invoiced: '#5b3a85',
  paid: '#0d5c3a',
  rejected: '#a01818',
  cancelled: '#4b5563',
}

function fmtPHP(cents: number): string {
  return (
    '₱ ' +
    (cents / 100).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function PortalProjectBillingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const session = await findActiveCustomerSession(token)
  if (!session) {
    return (
      <PortalStatus
        title="Link expired or invalid"
        body="This portal link doesn't match an active project, has expired, or has been revoked. Please ask your project contact to send a new one."
      />
    )
  }

  await logCustomerView(session.id, session.tenant_id)

  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      account_name: accounts.name,
    })
    .from(projects)
    .leftJoin(
      accounts,
      and(
        eq(projects.account_id, accounts.id),
        eq(accounts.tenant_id, session.tenant_id)
      )
    )
    .where(
      and(
        eq(projects.id, session.project_id),
        eq(projects.tenant_id, session.tenant_id)
      )
    )
    .limit(1)

  if (!project) {
    return (
      <PortalStatus
        title="Project unavailable"
        body="The project linked to this portal session is no longer available."
      />
    )
  }

  const invoiceRows = await db
    .select({
      id: invoices.id,
      invoice_number: invoices.invoice_number,
      status: invoices.status,
      subtotal_cents: invoices.subtotal_cents,
      retention_cents: invoices.retention_cents,
      vat_cents: invoices.vat_cents,
      net_amount_cents: invoices.net_amount_cents,
      due_date: invoices.due_date,
      paid_at: invoices.paid_at,
      created_at: invoices.created_at,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenant_id, session.tenant_id),
        eq(invoices.project_id, session.project_id),
        // Only invoices the contractor has issued: no drafts or cancelled ones,
        // and a reversed invoice keeps its status, so it is excluded by reversal.
        inArray(invoices.status, PORTAL_INVOICE_STATUSES),
        isNull(invoices.reversed_at)
      )
    )
    .orderBy(desc(invoices.created_at))

  const claimRows = await db
    .select({
      id: progressClaims.id,
      claim_number: progressClaims.claim_number,
      status: progressClaims.status,
      milestone_pct: progressClaims.milestone_pct,
      amount_cents: progressClaims.amount_cents,
      created_at: progressClaims.created_at,
      submitted_at: progressClaims.submitted_at,
      certified_at: progressClaims.certified_at,
      paid_at: progressClaims.paid_at,
    })
    .from(progressClaims)
    .where(
      and(
        eq(progressClaims.tenant_id, session.tenant_id),
        eq(progressClaims.project_id, session.project_id),
        // Internal drafts, rejected and cancelled claims are not for the client.
        inArray(progressClaims.status, PORTAL_CLAIM_STATUSES)
      )
    )
    .orderBy(desc(progressClaims.created_at))

  // Posted receipts against the current amount due, so a part-paid invoice
  // shows its unpaid balance (the same allocations the invoice screen nets).
  const receivedRows =
    invoiceRows.length === 0
      ? []
      : await db
          .select({
            invoice_id: cashAllocations.invoice_id,
            received_cents: sql<string>`coalesce(sum(${cashAllocations.amount_cents}), 0)::text`,
          })
          .from(cashAllocations)
          .innerJoin(
            cashTransactions,
            and(
              eq(cashTransactions.id, cashAllocations.cash_transaction_id),
              eq(cashTransactions.tenant_id, cashAllocations.tenant_id)
            )
          )
          .where(
            and(
              eq(cashAllocations.tenant_id, session.tenant_id),
              inArray(
                cashAllocations.invoice_id,
                invoiceRows.map((invoice) => invoice.id)
              ),
              eq(cashAllocations.allocation_type, 'customer_current_due'),
              eq(cashTransactions.status, 'posted')
            )
          )
          .groupBy(cashAllocations.invoice_id)
  const receivedByInvoice = new Map<string, number>()
  for (const row of receivedRows) {
    if (row.invoice_id) receivedByInvoice.set(row.invoice_id, Number(row.received_cents))
  }

  // KPIs: client-friendly aggregates.
  const totals = portalBillingTotals(invoiceRows, receivedByInvoice)
  const totalInvoiced = totals.invoicedCents
  const totalPaid = totals.paidCents
  const outstanding = totals.outstandingCents

  return (
    <div>
      {/* Header card */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          padding: '24px 28px',
          marginBottom: 20,
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.05)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#6b7280',
            fontWeight: 600,
          }}
        >
          Billing
        </p>
        <h2 style={{ margin: '6px 0 4px', fontSize: 22, color: '#0F2D4A', fontWeight: 600 }}>
          {project.name}
        </h2>
        {project.account_name && (
          <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>
            Prepared for <strong>{project.account_name}</strong>
          </p>
        )}
      </section>

      {/* KPI strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <KpiCard label="Total invoiced" value={fmtPHP(totalInvoiced)} tone="#0F2D4A" />
        <KpiCard label="Total paid" value={fmtPHP(totalPaid)} tone="#0d5c3a" />
        <KpiCard label="Outstanding" value={fmtPHP(outstanding)} tone={outstanding > 0 ? '#7a4a00' : '#4b5563'} />
      </div>

      {/* Invoices */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: '#0F2D4A',
            color: 'white',
            padding: '10px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          <span>Invoices</span>
          <span style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>{invoiceRows.length}</span>
        </div>
        {invoiceRows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13.5 }}>
            No invoices have been issued yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fafbfc' }}>
                <th style={th('left')}>Invoice #</th>
                <th style={th('left')}>Status</th>
                <th style={th('right')}>Subtotal</th>
                <th style={th('right')}>VAT</th>
                <th style={th('right')}>Retention</th>
                <th style={th('right')}>Net</th>
                <th style={th('left')}>Due</th>
                <th style={th('left')}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {invoiceRows.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #f1f3f6' }}>
                  <td
                    style={{
                      padding: '12px 18px',
                      fontFamily: 'var(--font-jetbrains), monospace',
                      fontWeight: 600,
                      color: '#0F2D4A',
                    }}
                  >
                    {inv.invoice_number}
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <StatusBadge
                      label={INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                      tone={INVOICE_STATUS_TONES[inv.status] ?? '#4b5563'}
                    />
                  </td>
                  <td style={tdNum}>{fmtPHP(inv.subtotal_cents)}</td>
                  <td style={tdNum}>{fmtPHP(inv.vat_cents)}</td>
                  <td style={tdNum}>{fmtPHP(inv.retention_cents)}</td>
                  <td style={{ ...tdNum, color: '#0F2D4A', fontWeight: 600 }}>
                    {fmtPHP(inv.net_amount_cents)}
                  </td>
                  <td style={{ padding: '12px 12px', color: '#4b5563' }}>{fmtDate(inv.due_date)}</td>
                  <td style={{ padding: '12px 18px', color: '#4b5563' }}>{fmtDate(inv.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      {/* Progress claims */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: '#0F2D4A',
            color: 'white',
            padding: '10px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          <span>Progress claims</span>
          <span style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>{claimRows.length}</span>
        </div>
        {claimRows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13.5 }}>
            No progress claims have been filed yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fafbfc' }}>
                <th style={th('left')}>Claim #</th>
                <th style={th('left')}>Status</th>
                <th style={th('right')}>Milestone</th>
                <th style={th('right')}>Amount</th>
                <th style={th('left')}>Submitted</th>
                <th style={th('left')}>Certified</th>
                <th style={th('left')}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {claimRows.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f3f6' }}>
                  <td
                    style={{
                      padding: '12px 18px',
                      fontFamily: 'var(--font-jetbrains), monospace',
                      fontWeight: 600,
                      color: '#0F2D4A',
                    }}
                  >
                    {c.claim_number}
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <StatusBadge
                      label={CLAIM_STATUS_LABELS[c.status] ?? c.status}
                      tone={CLAIM_STATUS_TONES[c.status] ?? '#4b5563'}
                    />
                  </td>
                  <td style={{ ...tdNum, fontWeight: 600, color: '#0F2D4A' }}>{c.milestone_pct}%</td>
                  <td style={tdNum}>{fmtPHP(c.amount_cents)}</td>
                  <td style={{ padding: '12px 12px', color: '#4b5563' }}>{fmtDate(c.submitted_at)}</td>
                  <td style={{ padding: '12px 12px', color: '#4b5563' }}>{fmtDate(c.certified_at)}</td>
                  <td style={{ padding: '12px 18px', color: '#4b5563' }}>{fmtDate(c.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  )
}

function th(align: 'left' | 'right'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '8px 12px',
    fontSize: 11,
    color: '#6b7280',
    fontWeight: 600,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  }
}

const tdNum: React.CSSProperties = {
  padding: '12px 12px',
  textAlign: 'right',
  fontFamily: 'var(--font-jetbrains), monospace',
  color: '#0F2D4A',
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #d8dde6',
        borderRadius: 10,
        padding: '18px 22px',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#6b7280',
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 22,
          fontWeight: 700,
          color: tone,
          fontFamily: 'var(--font-jetbrains), monospace',
        }}
      >
        {value}
      </p>
    </div>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: 'white',
        background: tone,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  )
}

function PortalStatus({ title, body }: { title: string; body: string }) {
  return (
    <section
      style={{
        background: 'white',
        border: '1px solid #d8dde6',
        borderRadius: 10,
        padding: '40px 32px',
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 22, color: '#4b5563' }}>{title}</h2>
      <p style={{ margin: '10px 0 0', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{body}</p>
    </section>
  )
}
