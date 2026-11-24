import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { requireRouteAccess } from '@/lib/require-route-access'
import { manilaToday } from '@/lib/finance/dates'
import { paramsRecord } from '@/lib/finance/params'
import {
  findFiscalPeriod,
  getTrialBalance,
  listFiscalPeriods,
} from '@/lib/finance/report-queries'
import {
  resolveTrialBalanceRange,
  trialBalanceParamsSchema,
} from '@/lib/finance/trial-balance'

export const metadata: Metadata = { title: 'Trial balance' }

const DANGER_NOTICE_STYLE = {
  borderColor: 'var(--color-danger)',
  background: 'var(--color-danger-soft)',
  color: 'var(--color-danger)',
} as const

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  requireRouteAccess(profile.role, '/finance/trial-balance')

  const parsed = trialBalanceParamsSchema.safeParse(
    paramsRecord(Object.entries(await searchParams))
  )
  const filters: { asOf?: string; period?: string } = parsed.success
    ? parsed.data
    : {}
  const notices: string[] = []
  if (!parsed.success) {
    notices.push('The filters were not valid and were ignored.')
  }

  const asOf = filters.asOf ?? manilaToday()
  const [periods, selectedPeriod] = await Promise.all([
    listFiscalPeriods(profile.tenantId),
    filters.period
      ? findFiscalPeriod(profile.tenantId, filters.period)
      : Promise.resolve(null),
  ])
  if (filters.period && !selectedPeriod) {
    notices.push('That fiscal period was not found; showing cumulative balances.')
  }

  const range = resolveTrialBalanceRange(asOf, selectedPeriod)
  const trialBalance = await getTrialBalance(profile.tenantId, range)

  const trialBalanceQuery = new URLSearchParams({
    asOf,
    ...(selectedPeriod ? { period: selectedPeriod.id } : {}),
  }).toString()
  const ledgerQuery = new URLSearchParams({
    ...(range.from ? { from: range.from } : {}),
    to: range.to,
  }).toString()

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href="/finance">Finance</Link> · Posted truth
          </p>
          <h1 className="page-title">Trial balance</h1>
          <p className="page-subtitle">
            {selectedPeriod && range.from
              ? `Movement in ${selectedPeriod.name}, ${formatDay(range.from)} to ${formatDay(range.to)}.`
              : `Cumulative balances through ${formatDay(range.to)}.`}{' '}
            Posted journal entries only; a reversal is its own entry and nets
            the original out.
          </p>
        </div>
        <div className="finance-header-actions">
          <a
            href={`/api/finance/export/trial-balance?${trialBalanceQuery}`}
            download
            className="finance-primary-link"
          >
            Export CSV
          </a>
          <Link href="/finance/ledger" className="finance-secondary-link">
            General ledger
          </Link>
        </div>
      </div>

      {notices.map((notice) => (
        <div className="finance-callout" role="status" key={notice}>
          {notice}
        </div>
      ))}

      <form className="ledger-filters">
        <div className="finance-field">
          <label htmlFor="trial-balance-as-of">As of</label>
          <input
            id="trial-balance-as-of"
            name="asOf"
            type="date"
            defaultValue={asOf}
          />
        </div>
        <div className="finance-field finance-field-grow">
          <label htmlFor="trial-balance-period">Fiscal period</label>
          <select
            id="trial-balance-period"
            name="period"
            defaultValue={selectedPeriod?.id ?? ''}
          >
            <option value="">Cumulative (all periods)</option>
            {periods.map((period) => (
              <option value={period.id} key={period.id}>
                {period.name} · {formatDay(period.startsOn)} to{' '}
                {formatDay(period.endsOn)}
              </option>
            ))}
          </select>
        </div>
        <button className="finance-secondary-button" type="submit">
          Apply
        </button>
      </form>

      <div className="journal-facts">
        <div>
          <span>Accounts</span>
          <strong>{trialBalance.rows.length}</strong>
        </div>
        <div>
          <span>Total debits</span>
          <strong>{formatPHP(trialBalance.totalDebitCents)}</strong>
        </div>
        <div>
          <span>Total credits</span>
          <strong>{formatPHP(trialBalance.totalCreditCents)}</strong>
        </div>
        <div>
          <span>Difference</span>
          <strong>{formatPHP(trialBalance.differenceCents)}</strong>
        </div>
      </div>

      {trialBalance.isBalanced ? (
        <div className="finance-callout finance-callout-muted" role="status">
          <span className="finance-status finance-status-posted">Balanced</span>{' '}
          Total debits equal total credits.
        </div>
      ) : (
        <div className="finance-callout" role="alert" style={DANGER_NOTICE_STYLE}>
          <span className="finance-status finance-status-overdue">
            Out of balance
          </span>{' '}
          Total debits and credits differ by{' '}
          {formatPHP(Math.abs(trialBalance.differenceCents))}. Every posted
          entry is enforced as balanced, so this indicates a defect. Do not tie
          this report to your books until it is investigated.
        </div>
      )}

      <div className="finance-table-shell">
        {trialBalance.rows.length === 0 ? (
          <div className="card-empty">
            <p>No ledger accounts yet.</p>
            <Link href="/finance#chart-of-accounts">Chart of accounts</Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th className="numeric">Debits</th>
                <th className="numeric">Credits</th>
                <th className="numeric">Balance</th>
              </tr>
            </thead>
            <tbody>
              {trialBalance.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      className="finance-entry-link"
                      href={`/finance/ledger?account=${row.id}`}
                    >
                      <code>{row.code}</code>
                    </Link>{' '}
                    · {row.name}
                    {!row.isActive && (
                      <span className="finance-cell-detail">Inactive</span>
                    )}
                  </td>
                  <td className="muted">{row.accountType}</td>
                  <td className="numeric">
                    {row.debitCents ? formatPHP(row.debitCents) : '—'}
                  </td>
                  <td className="numeric">
                    {row.creditCents ? formatPHP(row.creditCents) : '—'}
                  </td>
                  <td className="numeric">
                    {formatPHP(row.balanceCents)}
                    <span className="finance-cell-detail">
                      {row.balanceCents < 0
                        ? `opposite of normal ${row.normalBalance}`
                        : `${row.normalBalance} balance`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Totals</th>
                <th className="numeric">
                  {formatPHP(trialBalance.totalDebitCents)}
                </th>
                <th className="numeric">
                  {formatPHP(trialBalance.totalCreditCents)}
                </th>
                <th />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <section className="finance-section" aria-label="CSV exports">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Tie to your books</p>
            <h2>CSV exports</h2>
          </div>
          <p>
            Amounts in pesos, posted entries only, scoped to your company. Ledger
            exports stop at 50,000 rows and say so in the file.
          </p>
        </div>
        <div className="finance-header-actions">
          <a
            href={`/api/finance/export/trial-balance?${trialBalanceQuery}`}
            download
            className="finance-secondary-link"
          >
            Trial balance
          </a>
          <a
            href={`/api/finance/export/ledger?${ledgerQuery}`}
            download
            className="finance-secondary-link"
          >
            General ledger lines
          </a>
          <a
            href="/api/finance/export/receivables-aging"
            download
            className="finance-secondary-link"
          >
            Receivables aging
          </a>
          <a
            href="/api/finance/export/payables-aging"
            download
            className="finance-secondary-link"
          >
            Payables aging
          </a>
        </div>
      </section>
    </div>
  )
}
