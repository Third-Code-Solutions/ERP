import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Bank reconciliation' }

interface StatementRegisterRow {
  [key: string]: unknown
  id: string
  reference_number: string
  source_file_name: string
  status: 'draft' | 'reconciled' | 'voided'
  statement_start: string
  statement_end: string
  currency: string
  closing_balance_cents: number
  cash_account_id: string
  cash_account_name: string
  line_count: number
  matched_count: number
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export default async function BankReconciliationPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.manage')

  const statements = await db.execute<StatementRegisterRow>(sql`
    select
      statement.id,
      statement.reference_number,
      statement.source_file_name,
      statement.status,
      statement.statement_start,
      statement.statement_end,
      statement.currency,
      statement.closing_balance_cents,
      cash_account.id as cash_account_id,
      cash_account.name as cash_account_name,
      count(line.id)::integer as line_count,
      count(line.matched_cash_transaction_id)::integer as matched_count
    from public.bank_statements statement
    join public.cash_accounts cash_account
      on cash_account.id = statement.cash_account_id
     and cash_account.tenant_id = statement.tenant_id
    left join public.bank_statement_lines line
      on line.bank_statement_id = statement.id
     and line.tenant_id = statement.tenant_id
    where statement.tenant_id = ${profile.tenantId}::uuid
    group by statement.id, cash_account.id, cash_account.name
    order by statement.statement_end desc, statement.created_at desc
  `)

  const draftCount = statements.filter(
    (statement) => statement.status === 'draft'
  ).length
  const reconciledCount = statements.filter(
    (statement) => statement.status === 'reconciled'
  ).length
  const openExceptions = statements
    .filter((statement) => statement.status === 'draft')
    .reduce(
      (total, statement) =>
        total +
        (Number(statement.line_count) - Number(statement.matched_count)),
      0
    )
  const channels = new Set(
    statements.map((statement) => statement.cash_account_id)
  ).size

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Finance / External cash evidence</p>
          <h1 className="page-title">Bank reconciliation</h1>
          <p className="page-subtitle">
            Match institution-reported activity to posted cash, then lock the
            completed statement as auditable evidence.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/finance/cash" className="finance-secondary-link">
            Cash register
          </Link>
          <Link
            href="/finance/reconciliation/new"
            className="finance-primary-link"
          >
            Import statement
          </Link>
        </div>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Draft statements</p>
          <p className="kpi-card-value">{draftCount}</p>
          <p className="kpi-card-sub">Under Finance review</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Open exceptions</p>
          <p className="kpi-card-value">{openExceptions}</p>
          <p className="kpi-card-sub">Unmatched statement lines</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Reconciled</p>
          <p className="kpi-card-value">{reconciledCount}</p>
          <p className="kpi-card-sub">Immutable statement records</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Channels</p>
          <p className="kpi-card-value">{channels}</p>
          <p className="kpi-card-sub">Bank or e-wallet accounts represented</p>
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Statement register</p>
            <h2>Reconciliation evidence</h2>
          </div>
          <p>Drafts remain reviewable. Reconciled records cannot be rewritten.</p>
        </div>
        <div className="finance-table-shell">
          {statements.length === 0 ? (
            <div className="card-empty">
              <p>No bank statements imported yet.</p>
              <Link href="/finance/reconciliation/new">
                Import the first statement
              </Link>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Statement</th>
                  <th>Cash Account</th>
                  <th>Period</th>
                  <th>Match progress</th>
                  <th>Status</th>
                  <th className="numeric">Closing balance</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((statement) => (
                  <tr key={statement.id}>
                    <td>
                      <Link
                        href={`/finance/reconciliation/${statement.id}`}
                        className="finance-entry-link"
                      >
                        {statement.reference_number}
                      </Link>
                      <span className="finance-cell-detail">
                        {statement.source_file_name}
                      </span>
                    </td>
                    <td>{statement.cash_account_name}</td>
                    <td>
                      {statement.statement_start} to {statement.statement_end}
                    </td>
                    <td>
                      {Number(statement.matched_count)} /{' '}
                      {Number(statement.line_count)} matched
                    </td>
                    <td>
                      <span
                        className={`finance-status finance-status-${statement.status}`}
                      >
                        {statement.status}
                      </span>
                    </td>
                    <td className="numeric">
                      {formatMoney(
                        Number(statement.closing_balance_cents),
                        statement.currency
                      )}
                    </td>
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
