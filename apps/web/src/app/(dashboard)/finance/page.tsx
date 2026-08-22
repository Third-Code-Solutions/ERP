import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  cashAccounts,
  fiscalPeriods,
  journalEntries,
  ledgerAccounts,
} from '@third-code-erp/database/schema'
import { desc, eq } from 'drizzle-orm'
import {
  ClosePeriodButton,
  CreateCashAccountForm,
  CreateFiscalPeriodForm,
  CreateLedgerAccountForm,
  InventoryAccountMapping,
  PayablesAccountMapping,
  ReceivablesAccountMapping,
} from './setup-controls'

export const metadata: Metadata = { title: 'Finance control center' }

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export default async function FinancePage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  const canManage = can(profile.role, 'finance.manage')

  const [periods, accounts, journals, cashAccountRows] = await Promise.all([
    db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.tenant_id, profile.tenantId))
      .orderBy(desc(fiscalPeriods.starts_on)),
    db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenant_id, profile.tenantId))
      .orderBy(ledgerAccounts.code),
    db
      .select({
        id: journalEntries.id,
        entry_number: journalEntries.entry_number,
        status: journalEntries.status,
        source_type: journalEntries.source_type,
        posting_date: journalEntries.posting_date,
        description: journalEntries.description,
      })
      .from(journalEntries)
      .where(eq(journalEntries.tenant_id, profile.tenantId))
      .orderBy(desc(journalEntries.created_at))
      .limit(12),
    db
      .select()
      .from(cashAccounts)
      .where(eq(cashAccounts.tenant_id, profile.tenantId))
      .orderBy(cashAccounts.name),
  ])

  const openPeriods = periods.filter((period) => period.status === 'open')
  const activeAccounts = accounts.filter((account) => account.is_active)
  const draftCount = journals.filter((entry) => entry.status === 'draft').length
  const currentSystemMappings = Object.fromEntries(
    accounts
      .filter((account) => account.system_key)
      .map((account) => [account.system_key!, account.id])
  )

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Control center · Accounting</p>
          <h1 className="page-title">Finance</h1>
          <p className="page-subtitle">
            Prepare, post, trace, and reverse—without rewriting financial history.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link
            href="/finance/reconciliation"
            className="finance-secondary-link"
          >
            Reconcile
          </Link>
          <Link href="/finance/cash" className="finance-secondary-link">
            Cash
          </Link>
          <Link href="/finance/payables" className="finance-secondary-link">
            Payables
          </Link>
          <Link href="/finance/receivables" className="finance-secondary-link">
            Receivables
          </Link>
          <Link href="/finance/ledger" className="finance-secondary-link">
            Open ledger
          </Link>
          {canManage && (
            <Link href="/finance/journals/new" className="finance-primary-link">
              New journal
            </Link>
          )}
        </div>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Open periods</p>
          <p className="kpi-card-value">{openPeriods.length}</p>
          <p className="kpi-card-sub">Posting windows available</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Ledger accounts</p>
          <p className="kpi-card-value">{activeAccounts.length}</p>
          <p className="kpi-card-sub">Active classifications</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Draft journals</p>
          <p className="kpi-card-value">{draftCount}</p>
          <p className="kpi-card-sub">Awaiting review and posting</p>
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Settlement policy</p>
            <h2>Cash Accounts</h2>
          </div>
          <p>
            Map each bank, till, or e-wallet to one active asset ledger account.
          </p>
        </div>
        {canManage && <CreateCashAccountForm
          assetAccounts={activeAccounts
            .filter((account) => account.account_type === 'asset')
            .map((account) => ({
              id: account.id,
              code: account.code,
              name: account.name,
            }))}
        />}
        <div className="finance-record-list">
          {cashAccountRows.map((cashAccount) => (
            <div className="finance-record" key={cashAccount.id}>
              <div>
                <strong>{cashAccount.name}</strong>
                <span>
                  {cashAccount.account_kind} · {cashAccount.currency}
                  {cashAccount.account_identifier_last4
                    ? ` · •••• ${cashAccount.account_identifier_last4}`
                    : ''}
                </span>
              </div>
              <span
                className={`finance-status finance-status-${
                  cashAccount.is_active ? 'open' : 'closed'
                }`}
              >
                {cashAccount.is_active ? 'active' : 'inactive'}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Posting policy</p>
            <h2>Receivables control accounts</h2>
          </div>
          <p>
            Map invoice components once. Issuance uses these accounts
            transactionally.
          </p>
        </div>
        {canManage && <ReceivablesAccountMapping
          accounts={activeAccounts.map((account) => ({
            id: account.id,
            code: account.code,
            name: account.name,
            accountType: account.account_type,
          }))}
          current={currentSystemMappings}
        />}
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Posting policy</p>
            <h2>Payables control accounts</h2>
          </div>
          <p>
            Supplier bills post to controlled liability and tax accounts after
            Purchase Order matching.
          </p>
        </div>
        {canManage && <PayablesAccountMapping
          accounts={activeAccounts.map((account) => ({
            id: account.id,
            code: account.code,
            name: account.name,
            accountType: account.account_type,
          }))}
          current={currentSystemMappings}
        />}
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Posting policy</p>
            <h2>Inventory control accounts</h2>
          </div>
          <p>
            Stock Receipt posting debits Inventory and credits Goods Received
            Not Invoiced until Supplier Bill matching is completed.
          </p>
        </div>
        {canManage && <InventoryAccountMapping
          accounts={activeAccounts.map((account) => ({
            id: account.id,
            code: account.code,
            name: account.name,
            accountType: account.account_type,
          }))}
          current={currentSystemMappings}
        />}
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Next decisions</p>
            <h2>Recent journals</h2>
          </div>
          <p>Drafts stay editable. Posted entries are permanent.</p>
        </div>
        <div className="finance-table-shell">
          {journals.length === 0 ? (
            <div className="card-empty">
              <p>No journals yet.</p>
              {canManage && <Link href="/finance/journals/new">Create the opening entry</Link>}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Posting date</th>
                  <th>Description</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {journals.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <Link
                        className="finance-entry-link"
                        href={`/finance/journals/${entry.id}`}
                      >
                        {entry.entry_number ?? 'Draft'}
                      </Link>
                    </td>
                    <td>{formatDate(entry.posting_date)}</td>
                    <td>{entry.description}</td>
                    <td className="muted">{entry.source_type}</td>
                    <td>
                      <span
                        className={`finance-status finance-status-${entry.status}`}
                      >
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="finance-two-column">
        <section className="finance-section">
          <div className="finance-section-heading">
            <div>
              <p className="finance-eyebrow">Posting calendar</p>
              <h2>Fiscal periods</h2>
            </div>
          </div>
          {canManage && <CreateFiscalPeriodForm />}
          <div className="finance-record-list">
            {periods.map((period) => (
              <div className="finance-record" key={period.id}>
                <div>
                  <strong>{period.name}</strong>
                  <span>
                    {formatDate(period.starts_on)} – {formatDate(period.ends_on)}
                  </span>
                </div>
                <div className="finance-record-action">
                  <span className={`finance-status finance-status-${period.status}`}>
                    {period.status}
                  </span>
                  {canManage && period.status === 'open' && (
                    <ClosePeriodButton periodId={period.id} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="finance-section">
          <div className="finance-section-heading">
            <div>
              <p className="finance-eyebrow">Classification</p>
              <h2>Chart of accounts</h2>
            </div>
          </div>
          {canManage && <CreateLedgerAccountForm />}
          <div className="finance-record-list">
            {accounts.map((account) => (
              <div className="finance-record" key={account.id}>
                <div className="finance-account-label">
                  <code>{account.code}</code>
                  <div>
                    <strong>{account.name}</strong>
                    <span>
                      {account.account_type} · {account.normal_balance}
                    </span>
                  </div>
                </div>
                <span
                  className={`finance-status finance-status-${
                    account.is_active ? 'open' : 'closed'
                  }`}
                >
                  {account.is_active ? 'active' : 'inactive'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
