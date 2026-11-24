import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { requireRouteAccess } from '@/lib/require-route-access'
import { db } from '@third-code-erp/database'
import {
  accounts,
  journalEntries,
  journalLines,
  ledgerAccounts,
  projects,
  vendors,
} from '@third-code-erp/database/schema'
import { and, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import {
  financeLedgerReadsUseCoreApi,
  getFinanceLedgerThroughCoreApi,
} from '@/lib/erp-core-client'
import {
  clampLedgerPage,
  LEDGER_PAGE_SIZE,
  ledgerPageCount,
  ledgerPageHref,
  ledgerPageWindow,
  parseLedgerPage,
} from './ledger-pagination'

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

type LedgerDisplayRow = {
  id: string
  entry_id: string
  entry_number: string | null
  posting_date: string
  entry_description: string
  account_code: string
  account_name: string
  project_id: string | null
  project_name: string | null
  business_account_id: string | null
  business_account_name: string | null
  vendor_id: string | null
  vendor_name: string | null
  line_description: string | null
  debit_cents: number
  credit_cents: number
}

function LedgerPager({
  filters,
  page,
  pageCount,
}: {
  filters: Parameters<typeof ledgerPageHref>[0]
  page: number
  pageCount: number
}) {
  return (
    <nav className="finance-header-actions" aria-label="Ledger pages">
      {page > 1 ? (
        <Link
          href={ledgerPageHref(filters, page - 1)}
          className="finance-secondary-link"
        >
          Previous page
        </Link>
      ) : null}
      <span className="muted">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link
          href={ledgerPageHref(filters, page + 1)}
          className="finance-secondary-link"
        >
          Next page
        </Link>
      ) : null}
    </nav>
  )
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
    page?: string
  }>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  requireRouteAccess(profile.role, '/finance/ledger')
  const canManage = can(profile.role, 'finance.manage')
  const filters = await searchParams

  const applied = {
    account: filters.account && isUuid(filters.account) ? filters.account : undefined,
    customer:
      filters.customer && isUuid(filters.customer) ? filters.customer : undefined,
    vendor: filters.vendor && isUuid(filters.vendor) ? filters.vendor : undefined,
    from: filters.from && isIsoDate(filters.from) ? filters.from : undefined,
    to: filters.to && isIsoDate(filters.to) ? filters.to : undefined,
  }
  const requestedPage = parseLedgerPage(filters.page)

  const conditions: SQL[] = [
    eq(journalEntries.tenant_id, profile.tenantId),
    eq(journalLines.tenant_id, profile.tenantId),
    eq(journalEntries.status, 'posted'),
  ]
  if (applied.account) {
    conditions.push(eq(journalLines.ledger_account_id, applied.account))
  }
  if (applied.customer) {
    conditions.push(eq(journalLines.business_account_id, applied.customer))
  }
  if (applied.vendor) {
    conditions.push(eq(journalLines.vendor_id, applied.vendor))
  }
  if (applied.from) {
    conditions.push(gte(journalEntries.posting_date, applied.from))
  }
  if (applied.to) {
    conditions.push(lte(journalEntries.posting_date, applied.to))
  }

  let ledgerAccountRows: Array<{ id: string; code: string; name: string }>
  let businessAccounts: Array<{ id: string; name: string }>
  let vendorRows: Array<{ id: string; name: string }>
  let rows: LedgerDisplayRow[]
  let totalDebit: number
  let totalCredit: number
  let totalLines: number
  let page: number

  if (financeLedgerReadsUseCoreApi(profile.tenantId)) {
    const result = await getFinanceLedgerThroughCoreApi({
      accountId: applied.account,
      customerId: applied.customer,
      vendorId: applied.vendor,
      projectId: undefined,
      from: applied.from,
      to: applied.to,
      page: requestedPage,
      limit: LEDGER_PAGE_SIZE,
    })
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'Finance ledger was not read')
    }
    ledgerAccountRows = result.data.ledgerAccounts
    businessAccounts = result.data.businessAccounts
    vendorRows = result.data.vendors
    rows = result.data.rows.map((row) => ({
      id: row.id,
      entry_id: row.entryId,
      entry_number: row.entryNumber,
      posting_date: row.postingDate,
      entry_description: row.entryDescription,
      account_code: row.accountCode,
      account_name: row.accountName,
      project_id: row.projectId,
      project_name: row.projectName,
      business_account_id: row.customerId,
      business_account_name: row.customerName,
      vendor_id: row.vendorId,
      vendor_name: row.vendorName,
      line_description: row.lineDescription,
      debit_cents: row.debitCents,
      credit_cents: row.creditCents,
    }))
    totalDebit = result.data.totalDebitCents
    totalCredit = result.data.totalCreditCents
    totalLines = result.data.total
    page = result.data.page
  } else {
    // Totals come from SQL over every matching line, never from the fetched page.
    const [totals] = await db
      .select({
        lineCount: count(),
        totalDebit: sql<string>`coalesce(sum(${journalLines.debit_cents}), 0)`,
        totalCredit: sql<string>`coalesce(sum(${journalLines.credit_cents}), 0)`,
      })
      .from(journalLines)
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, journalLines.journal_entry_id),
          eq(journalEntries.tenant_id, journalLines.tenant_id)
        )
      )
      .where(and(...conditions))
    totalLines = Number(totals?.lineCount ?? 0)
    totalDebit = Number(totals?.totalDebit ?? 0)
    totalCredit = Number(totals?.totalCredit ?? 0)
    page = clampLedgerPage(requestedPage, totalLines)

    const directResult = await Promise.all([
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
        .limit(LEDGER_PAGE_SIZE)
        .offset((page - 1) * LEDGER_PAGE_SIZE),
    ])
    ledgerAccountRows = directResult[0]
    businessAccounts = directResult[1]
    vendorRows = directResult[2]
    rows = directResult[3]
  }

  const pageCount = ledgerPageCount(totalLines)
  const shown = ledgerPageWindow(page, totalLines)

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
        {canManage && (
          <Link href="/finance/journals/new" className="finance-primary-link">
            New journal
          </Link>
        )}
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
          <span>Matching lines</span>
          <strong>{totalLines}</strong>
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

      {totalLines > LEDGER_PAGE_SIZE && (
        <>
          <p className="finance-ledger-limit" role="status">
            Showing lines {shown.first}–{shown.last} of {totalLines}. Totals
            above cover all {totalLines} matching lines.
          </p>
          <LedgerPager
            filters={applied}
            page={page}
            pageCount={pageCount}
          />
        </>
      )}

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
      {totalLines > LEDGER_PAGE_SIZE && (
        <LedgerPager filters={applied} page={page} pageCount={pageCount} />
      )}
    </div>
  )
}
