import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  cashAccounts,
  cashTransactions,
  vendors,
} from '@third-code-erp/database/schema'
import { and, desc, eq } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Cash transactions' }

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export default async function CashPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.manage')

  const rows = await db
    .select({
      id: cashTransactions.id,
      internalNumber: cashTransactions.internal_number,
      referenceNumber: cashTransactions.reference_number,
      direction: cashTransactions.direction,
      status: cashTransactions.status,
      transactionDate: cashTransactions.transaction_date,
      amountCents: cashTransactions.amount_cents,
      cashAccountName: cashAccounts.name,
      businessAccountName: accounts.name,
      vendorName: vendors.name,
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
    .where(eq(cashTransactions.tenant_id, profile.tenantId))
    .orderBy(
      desc(cashTransactions.transaction_date),
      desc(cashTransactions.created_at)
    )

  const posted = rows.filter((row) => row.status === 'posted')
  const receipts = posted
    .filter((row) => row.direction === 'receipt')
    .reduce((sum, row) => sum + row.amountCents, 0)
  const disbursements = posted
    .filter((row) => row.direction === 'disbursement')
    .reduce((sum, row) => sum + row.amountCents, 0)
  const draftCount = rows.filter((row) => row.status === 'draft').length

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Finance · Settlement subledger</p>
          <h1 className="page-title">Cash</h1>
          <p className="page-subtitle">
            Receipts and disbursements stay tied to their invoices, Supplier
            Bills, Cash Account, and immutable journal evidence.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/finance" className="finance-secondary-link">
            Finance controls
          </Link>
          <Link href="/finance/cash/new" className="finance-primary-link">
            New cash transaction
          </Link>
        </div>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Posted receipts</p>
          <p className="kpi-card-value finance-money-kpi">
            {formatPHP(receipts)}
          </p>
          <p className="kpi-card-sub">Customer cash allocated</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Posted disbursements</p>
          <p className="kpi-card-value finance-money-kpi">
            {formatPHP(disbursements)}
          </p>
          <p className="kpi-card-sub">Vendor cash allocated</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Draft evidence</p>
          <p className="kpi-card-value">{draftCount}</p>
          <p className="kpi-card-sub">Awaiting controlled posting</p>
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Evidence register</p>
            <h2>Cash transactions</h2>
          </div>
          <p>Reversals preserve both the original and opposite journal.</p>
        </div>
        <div className="finance-table-shell">
          {rows.length === 0 ? (
            <div className="card-empty">
              <p>No cash evidence yet.</p>
              <Link href="/finance/cash/new">Record the first transaction</Link>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Date</th>
                  <th>Direction</th>
                  <th>Counterparty</th>
                  <th>Cash Account</th>
                  <th>Status</th>
                  <th className="numeric">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        href={`/finance/cash/${row.id}`}
                        className="finance-entry-link"
                      >
                        {row.internalNumber ?? row.referenceNumber}
                      </Link>
                      {row.internalNumber && (
                        <span className="finance-cell-detail">
                          Ref {row.referenceNumber}
                        </span>
                      )}
                    </td>
                    <td>{row.transactionDate}</td>
                    <td>{row.direction}</td>
                    <td>{row.businessAccountName ?? row.vendorName}</td>
                    <td>{row.cashAccountName}</td>
                    <td>
                      <span
                        className={`finance-status finance-status-${row.status}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="numeric">{formatPHP(row.amountCents)}</td>
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
