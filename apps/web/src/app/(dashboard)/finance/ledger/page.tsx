import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  journalEntries,
  journalLines,
  ledgerAccounts,
  projects,
  vendors,
} from '@third-code-erp/database/schema'
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm'

export const metadata: Metadata = { title: 'General ledger' }

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string
    customer?: string
    vendor?: string
    from?: string
    to?: string
  }>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.manage')
  const filters = await searchParams

  const conditions: SQL[] = [
    eq(journalEntries.tenant_id, profile.tenantId),
    eq(journalEntries.status, 'posted'),
  ]
  if (filters.account && isUuid(filters.account)) {
    conditions.push(eq(journalLines.ledger_account_id, filters.account))
  }
  if (filters.customer && isUuid(filters.customer)) {
    conditions.push(eq(journalLines.business_account_id, filters.customer))
  }
  if (filters.vendor && isUuid(filters.vendor)) {
    conditions.push(eq(journalLines.vendor_id, filters.vendor))
  }
  if (filters.from && isIsoDate(filters.from)) {
    conditions.push(gte(journalEntries.posting_date, filters.from))
  }
  if (filters.to && isIsoDate(filters.to)) {
    conditions.push(lte(journalEntries.posting_date, filters.to))
  }

  const [ledgerAccountRows, businessAccounts, vendorRows, rows] =
    await Promise.all([
      db
        .select({
          id: ledgerAccounts.id,
          code: ledgerAccounts.code,
          name: ledgerAccounts.name,
        })
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.tenant_id, profile.tenantId))
        .orderBy(ledgerAccounts.code),
      db
        .select({
          id: accounts.id,
          name: accounts.name,
        })
        .from(accounts)
        .where(eq(accounts.tenant_id, profile.tenantId))
        .orderBy(accounts.name),
      db
        .select({
          id: vendors.id,
          name: vendors.name,
        })
        .from(vendors)
        .where(eq(vendors.tenant_id, profile.tenantId))
        .orderBy(vendors.name),
      db
      .select({
        id: journalLines.id,
        entry_id: journalEntries.id,
        entry_number: journalEntries.entry_number,
        posting_date: journalEntries.posting_date,
        entry_description: journalEntries.description,
        account_code: ledgerAccounts.code,
        account_name: ledgerAccounts.name,
        project_id: projects.id,
        project_name: projects.name,
        business_account_id: accounts.id,
        business_account_name: accounts.name,
        vendor_id: vendors.id,
        vendor_name: vendors.name,
        line_description: journalLines.description,
        debit_cents: journalLines.debit_cents,
        credit_cents: journalLines.credit_cents,
      })
      .from(journalLines)
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, journalLines.journal_entry_id),
          eq(journalEntries.tenant_id, journalLines.tenant_id)
        )
      )
      .innerJoin(
        ledgerAccounts,
        and(
          eq(ledgerAccounts.id, journalLines.ledger_account_id),
          eq(ledgerAccounts.tenant_id, journalLines.tenant_id)
        )
      )
      .leftJoin(
        projects,
        and(
          eq(projects.id, journalLines.project_id),
          eq(projects.tenant_id, journalLines.tenant_id)
        )
      )
      .leftJoin(
        accounts,
        and(
          eq(accounts.id, journalLines.business_account_id),
          eq(accounts.tenant_id, journalLines.tenant_id)
        )
      )
      .leftJoin(
        vendors,
        and(
          eq(vendors.id, journalLines.vendor_id),
          eq(vendors.tenant_id, journalLines.tenant_id)
        )
      )
      .where(and(...conditions))
      .orderBy(
        desc(journalEntries.posting_date),
        desc(journalEntries.entry_number),
        journalLines.line_number
      )
      .limit(500),
    ])

  const totalDebit = rows.reduce((sum, row) => sum + row.debit_cents, 0)
  const totalCredit = rows.reduce((sum, row) => sum + row.credit_cents, 0)

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href="/finance">Finance</Link> · Posted truth
          </p>
          <h1 className="page-title">General ledger</h1>
          <p className="page-subtitle">
            Immutable posted lines with journal and project traceability.
          </p>
        </div>
        <Link href="/finance/journals/new" className="finance-primary-link">
          New journal
        </Link>
      </div>

      <form className="ledger-filters">
        <div className="finance-field finance-field-grow">
          <label htmlFor="ledger-account-filter">Ledger account</label>
          <select
            id="ledger-account-filter"
            name="account"
            defaultValue={filters.account ?? ''}
          >
            <option value="">All accounts</option>
            {ledgerAccountRows.map((account) => (
              <option value={account.id} key={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="finance-field finance-field-grow">
          <label htmlFor="ledger-vendor-filter">Vendor</label>
          <select
            id="ledger-vendor-filter"
            name="vendor"
            defaultValue={filters.vendor ?? ''}
          >
            <option value="">All Vendors</option>
            {vendorRows.map((vendor) => (
              <option value={vendor.id} key={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>
        <div className="finance-field finance-field-grow">
          <label htmlFor="ledger-customer-filter">Business Account</label>
          <select
            id="ledger-customer-filter"
            name="customer"
            defaultValue={filters.customer ?? ''}
          >
            <option value="">All customers</option>
            {businessAccounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="finance-field">
          <label htmlFor="ledger-from">From</label>
          <input
            id="ledger-from"
            name="from"
            type="date"
            defaultValue={filters.from}
          />
        </div>
        <div className="finance-field">
          <label htmlFor="ledger-to">To</label>
          <input id="ledger-to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <button className="finance-secondary-button" type="submit">
          Apply
        </button>
      </form>

      <div className="journal-facts">
        <div>
          <span>Visible lines</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Total debits</span>
          <strong>{formatPHP(totalDebit)}</strong>
        </div>
        <div>
          <span>Total credits</span>
          <strong>{formatPHP(totalCredit)}</strong>
        </div>
        <div>
          <span>Difference</span>
          <strong>{formatPHP(totalDebit - totalCredit)}</strong>
        </div>
      </div>

      <div className="finance-table-shell">
        {rows.length === 0 ? (
          <div className="card-empty">
            <p>No posted ledger lines match these filters.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Journal</th>
                <th>Ledger account</th>
                <th>Project</th>
                <th>Customer</th>
                <th>Vendor</th>
                <th>Description</th>
                <th className="numeric">Debit</th>
                <th className="numeric">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.posting_date}</td>
                  <td>
                    <Link
                      className="finance-entry-link"
                      href={`/finance/journals/${row.entry_id}`}
                    >
                      {row.entry_number}
                    </Link>
                  </td>
                  <td>
                    <code>{row.account_code}</code> · {row.account_name}
                  </td>
                  <td>
                    {row.project_id ? (
                      <Link href={`/projects/${row.project_id}`}>
                        {row.project_name}
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {row.business_account_id ? (
                      <Link href={`/crm/accounts/${row.business_account_id}`}>
                        {row.business_account_name}
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {row.vendor_id ? (
                      row.vendor_name
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{row.line_description || row.entry_description}</td>
                  <td className="numeric">
                    {row.debit_cents ? formatPHP(row.debit_cents) : '—'}
                  </td>
                  <td className="numeric">
                    {row.credit_cents ? formatPHP(row.credit_cents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length === 500 && (
        <p className="finance-ledger-limit">
          Showing the newest 500 lines. Narrow the period or ledger account.
        </p>
      )}
    </div>
  )
}
