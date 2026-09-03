import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  cashAccounts,
  cashTransactions,
  vendors,
} from '@third-code-erp/database/schema'
import { and, eq, sql } from 'drizzle-orm'
import { CashActions } from './cash-actions'

export const metadata: Metadata = { title: 'Cash transaction' }

interface AllocationRow {
  [key: string]: unknown
  id: string
  allocation_type:
    | 'customer_current_due'
    | 'customer_retention'
    | 'supplier_bill'
  invoice_id: string | null
  supplier_bill_id: string | null
  target_number: string
  project_name: string | null
  description: string | null
  amount_cents: number
}

interface BankEvidenceRow {
  [key: string]: unknown
  id: string
  line_number: number
  matched_at: string
  statement_id: string
  statement_reference: string
  statement_status: 'draft' | 'reconciled' | 'voided'
  statement_end: string
  source_file_name: string
}

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export default async function CashTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  const canManageCash = can(profile.role, 'finance.manage_cash')
  const { id } = await requireUuidRouteParams(params)

  const [transaction] = await db
    .select({
      id: cashTransactions.id,
      internalNumber: cashTransactions.internal_number,
      referenceNumber: cashTransactions.reference_number,
      direction: cashTransactions.direction,
      status: cashTransactions.status,
      transactionDate: cashTransactions.transaction_date,
      currency: cashTransactions.currency,
      amountCents: cashTransactions.amount_cents,
      notes: cashTransactions.notes,
      cashAccountName: cashAccounts.name,
      cashAccountKind: cashAccounts.account_kind,
      businessAccountName: accounts.name,
      vendorName: vendors.name,
      postingJournalId: cashTransactions.posting_journal_entry_id,
      reversalJournalId: cashTransactions.reversal_journal_entry_id,
      reversalReason: cashTransactions.reversal_reason,
    })
    .from(cashTransactions)
    .innerJoin(
      cashAccounts,
      and(
        eq(cashAccounts.id, cashTransactions.cash_account_id),
        eq(cashAccounts.tenant_id, cashTransactions.tenant_id)
      )
    )
    .leftJoin(
      accounts,
      and(
        eq(accounts.id, cashTransactions.business_account_id),
        eq(accounts.tenant_id, cashTransactions.tenant_id)
      )
    )
    .leftJoin(
      vendors,
      and(
        eq(vendors.id, cashTransactions.vendor_id),
        eq(vendors.tenant_id, cashTransactions.tenant_id)
      )
    )
    .where(
      and(
        eq(cashTransactions.id, id),
        eq(cashTransactions.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!transaction) notFound()

  const allocations = await db.execute<AllocationRow>(sql`
    select
      allocation.id,
      allocation.allocation_type,
      allocation.invoice_id,
      allocation.supplier_bill_id,
      case
        when allocation.invoice_id is not null
          then invoice.invoice_number
        else coalesce(bill.internal_number, bill.vendor_bill_number)
      end as target_number,
      coalesce(invoice_project.name, bill_project.name) as project_name,
      allocation.description,
      allocation.amount_cents
    from public.cash_allocations allocation
    left join public.invoices invoice
      on invoice.id = allocation.invoice_id
     and invoice.tenant_id = allocation.tenant_id
    left join public.projects invoice_project
      on invoice_project.id = invoice.project_id
     and invoice_project.tenant_id = invoice.tenant_id
    left join public.supplier_bills bill
      on bill.id = allocation.supplier_bill_id
     and bill.tenant_id = allocation.tenant_id
    left join public.projects bill_project
      on bill_project.id = bill.project_id
     and bill_project.tenant_id = bill.tenant_id
    where allocation.cash_transaction_id = ${transaction.id}::uuid
      and allocation.tenant_id = ${profile.tenantId}::uuid
    order by allocation.line_number
  `)
  const bankEvidence = await db.execute<BankEvidenceRow>(sql`
    select
      line.id,
      line.line_number,
      line.matched_at,
      statement.id as statement_id,
      statement.reference_number as statement_reference,
      statement.status as statement_status,
      statement.statement_end,
      statement.source_file_name
    from public.bank_statement_lines line
    join public.bank_statements statement
      on statement.id = line.bank_statement_id
     and statement.tenant_id = line.tenant_id
    where line.matched_cash_transaction_id = ${transaction.id}::uuid
      and line.tenant_id = ${profile.tenantId}::uuid
    limit 1
  `)

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/finance/cash">Cash</Link>
        <span>/</span>
        <span>{transaction.internalNumber ?? 'Draft'}</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            {transaction.direction === 'receipt'
              ? 'Customer receipt'
              : 'Vendor disbursement'}
          </p>
          <h1 className="page-title">
            {transaction.internalNumber ?? transaction.referenceNumber}
          </h1>
          <p className="page-subtitle">
            {transaction.businessAccountName ?? transaction.vendorName} ·{' '}
            {transaction.cashAccountName}
          </p>
        </div>
        <span
          className={`finance-status finance-status-${transaction.status}`}
        >
          {transaction.status}
        </span>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Amount</p>
          <p className="kpi-card-value finance-money-kpi">
            {formatPHP(transaction.amountCents)}
          </p>
          <p className="kpi-card-sub">{transaction.currency}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Transaction date</p>
          <p className="kpi-card-value">{transaction.transactionDate}</p>
          <p className="kpi-card-sub">Reference {transaction.referenceNumber}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Cash Account</p>
          <p className="kpi-card-value">{transaction.cashAccountName}</p>
          <p className="kpi-card-sub">{transaction.cashAccountKind}</p>
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Subledger evidence</p>
            <h2>Allocations</h2>
          </div>
          <p>Allocation total must equal the cash evidence exactly.</p>
        </div>
        <div className="finance-table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Open item</th>
                <th>Component</th>
                <th>Project</th>
                <th>Description</th>
                <th className="numeric">Amount</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((allocation) => (
                <tr key={allocation.id}>
                  <td>
                    <Link
                      href={
                        allocation.invoice_id
                          ? `/invoices/${allocation.invoice_id}`
                          : `/finance/payables/${allocation.supplier_bill_id}`
                      }
                    >
                      {allocation.target_number}
                    </Link>
                  </td>
                  <td>
                    {allocation.allocation_type.replaceAll('_', ' ')}
                  </td>
                  <td>{allocation.project_name ?? '—'}</td>
                  <td>{allocation.description ?? '—'}</td>
                  <td className="numeric">
                    {formatPHP(Number(allocation.amount_cents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transaction.notes && (
          <p className="finance-control-note">{transaction.notes}</p>
        )}
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">External confirmation</p>
            <h2>Bank reconciliation</h2>
          </div>
          <p>Institution evidence remains separate from the accounting event.</p>
        </div>
        {bankEvidence[0] ? (
          <div className="finance-record-list">
            <div className="finance-record">
              <div>
                <strong>{bankEvidence[0].statement_reference}</strong>
                <span>
                  Line {Number(bankEvidence[0].line_number)} /{' '}
                  {bankEvidence[0].source_file_name}
                </span>
              </div>
              <div className="finance-record-action">
                <span
                  className={`finance-status finance-status-${bankEvidence[0].statement_status}`}
                >
                  {bankEvidence[0].statement_status}
                </span>
                <Link
                  href={`/finance/reconciliation/${bankEvidence[0].statement_id}`}
                >
                  Open statement
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="card-empty">
            <p>No bank statement line is matched to this cash evidence.</p>
            <Link href="/finance/reconciliation">Open reconciliation</Link>
          </div>
        )}
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Controlled state change</p>
            <h2>Posting and reversal</h2>
          </div>
          <p>Closed periods and over-allocation block the whole transaction.</p>
        </div>
        {canManageCash && (
          <CashActions
            transactionId={transaction.id}
            status={transaction.status}
            defaultDate={new Date().toISOString().slice(0, 10)}
          />
        )}
        <div className="finance-record-list">
          {transaction.postingJournalId && (
            <div className="finance-record">
              <div>
                <strong>Posting journal</strong>
                <span>Immutable cash posting evidence</span>
              </div>
              <Link href={`/finance/journals/${transaction.postingJournalId}`}>
                Open journal
              </Link>
            </div>
          )}
          {transaction.reversalJournalId && (
            <div className="finance-record">
              <div>
                <strong>Reversal journal</strong>
                <span>{transaction.reversalReason}</span>
              </div>
              <Link href={`/finance/journals/${transaction.reversalJournalId}`}>
                Open reversal
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
