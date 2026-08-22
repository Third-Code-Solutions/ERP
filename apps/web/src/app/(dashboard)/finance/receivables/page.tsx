import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  invoices,
  projects,
} from '@third-code-erp/database/schema'
import { and, desc, eq, isNotNull, inArray, sql } from 'drizzle-orm'
import {
  financeReceivablesReadsUseCoreApi,
  getFinanceReceivablesThroughCoreApi,
} from '@/lib/erp-core-client'

export const metadata: Metadata = { title: 'Customer receivables' }

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function daysFromToday(value: Date | null): number | null {
  if (!value) return null
  const today = new Date()
  const utcToday = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  )
  const utcDue = Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate()
  )
  return Math.floor((utcToday - utcDue) / 86_400_000)
}

function agingLabel(daysPastDue: number | null): string {
  if (daysPastDue === null) return 'No due date'
  if (daysPastDue <= 0) return 'Current'
  if (daysPastDue <= 30) return '1–30 days'
  if (daysPastDue <= 60) return '31–60 days'
  if (daysPastDue <= 90) return '61–90 days'
  return '90+ days'
}

type ReceivableRow = {
  id: string
  invoice_number: string
  status: 'issued' | 'partial_payment' | 'overdue'
  net_amount_cents: number
  retention_cents: number
  withholding_tax_cents: number
  current_allocated_cents: number
  retention_allocated_cents: number
  current_open_cents: number
  retention_open_cents: number
  due_date: Date | null
  issued_at: Date | null
  issuance_journal_entry_id: string | null
  project_id: string
  project_name: string
  account_id: string
  account_name: string
}

export default async function ReceivablesPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')

  let openRows: ReceivableRow[]
  let totalDue: number
  let totalRetention: number
  let totalWithheld: number
  let overdueTotal: number
  let overdueCount: number
  let openCount: number

  if (financeReceivablesReadsUseCoreApi(profile.tenantId)) {
    const result = await getFinanceReceivablesThroughCoreApi({
      accountId: undefined,
      projectId: undefined,
      status: undefined,
      dueFrom: undefined,
      dueTo: undefined,
      page: 1,
      limit: 500,
    })
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'Customer receivables were not read.')
    }
    if (result.data.total > result.data.rows.length) {
      throw new Error(
        'Customer receivables exceed the closed projection page limit.'
      )
    }
    openRows = result.data.rows.map((invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      status: invoice.status,
      net_amount_cents: invoice.netAmountCents,
      retention_cents: invoice.retentionCents,
      withholding_tax_cents: invoice.withholdingTaxCents,
      current_allocated_cents: invoice.currentAllocatedCents,
      retention_allocated_cents: invoice.retentionAllocatedCents,
      current_open_cents: invoice.currentOpenCents,
      retention_open_cents: invoice.retentionOpenCents,
      due_date: invoice.dueDate ? new Date(invoice.dueDate) : null,
      issued_at: invoice.issuedAt ? new Date(invoice.issuedAt) : null,
      issuance_journal_entry_id: invoice.issuanceJournalEntryId,
      project_id: invoice.projectId,
      project_name: invoice.projectName,
      account_id: invoice.accountId,
      account_name: invoice.accountName,
    }))
    totalDue = result.data.totalDueCents
    totalRetention = result.data.totalRetentionCents
    totalWithheld = result.data.totalWithheldCents
    overdueTotal = result.data.overdueTotalCents
    overdueCount = result.data.overdueCount
    openCount = result.data.total
  } else {
    const rows = await db
      .select({
        id: invoices.id,
        invoice_number: invoices.invoice_number,
        status: invoices.status,
        net_amount_cents: invoices.net_amount_cents,
        retention_cents: invoices.retention_cents,
        withholding_tax_cents: invoices.withholding_tax_cents,
        current_allocated_cents: sql<number>`coalesce((
          select sum(allocation.amount_cents)
          from public.cash_allocations allocation
          join public.cash_transactions cash_tx
            on cash_tx.id = allocation.cash_transaction_id
           and cash_tx.tenant_id = allocation.tenant_id
          where allocation.invoice_id = ${invoices.id}
            and allocation.tenant_id = ${invoices.tenant_id}
            and allocation.allocation_type = 'customer_current_due'
            and cash_tx.status = 'posted'
        ), 0)`,
        retention_allocated_cents: sql<number>`coalesce((
          select sum(allocation.amount_cents)
          from public.cash_allocations allocation
          join public.cash_transactions cash_tx
            on cash_tx.id = allocation.cash_transaction_id
           and cash_tx.tenant_id = allocation.tenant_id
          where allocation.invoice_id = ${invoices.id}
            and allocation.tenant_id = ${invoices.tenant_id}
            and allocation.allocation_type = 'customer_retention'
            and cash_tx.status = 'posted'
        ), 0)`,
        due_date: invoices.due_date,
        issued_at: invoices.issued_at,
        issuance_journal_entry_id: invoices.issuance_journal_entry_id,
        project_id: projects.id,
        project_name: projects.name,
        account_id: accounts.id,
        account_name: accounts.name,
      })
      .from(invoices)
      .innerJoin(
        projects,
        and(
          eq(projects.id, invoices.project_id),
          eq(projects.tenant_id, invoices.tenant_id)
        )
      )
      .innerJoin(
        accounts,
        and(
          eq(accounts.id, invoices.account_id),
          eq(accounts.tenant_id, invoices.tenant_id)
        )
      )
      .where(
        and(
          eq(invoices.tenant_id, profile.tenantId),
          isNotNull(invoices.issuance_journal_entry_id),
          inArray(invoices.status, ['issued', 'partial_payment', 'overdue'])
        )
      )
      .orderBy(desc(invoices.due_date), desc(invoices.issued_at))

    openRows = rows.map((invoice) => ({
      ...invoice,
      status: invoice.status as ReceivableRow['status'],
      current_open_cents: Math.max(
        invoice.net_amount_cents - Number(invoice.current_allocated_cents ?? 0),
        0
      ),
      retention_open_cents: Math.max(
        invoice.retention_cents - Number(invoice.retention_allocated_cents ?? 0),
        0
      ),
    }))
    totalDue = openRows.reduce(
      (sum, invoice) => sum + invoice.current_open_cents,
      0
    )
    totalRetention = openRows.reduce(
      (sum, invoice) => sum + invoice.retention_open_cents,
      0
    )
    totalWithheld = rows.reduce(
      (sum, invoice) => sum + invoice.withholding_tax_cents,
      0
    )
    const overdue = openRows.filter((invoice) => {
      const days = daysFromToday(invoice.due_date)
      return days !== null && days > 0
    })
    overdueCount = overdue.length
    overdueTotal = overdue.reduce(
      (sum, invoice) => sum + invoice.current_open_cents,
      0
    )
    openCount = openRows.length
  }

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href="/finance">Finance</Link> · Customer cash
          </p>
          <h1 className="page-title">Receivables</h1>
          <p className="page-subtitle">
            Live customer balances, allocated receipts, retained amounts, and
            posting evidence.
          </p>
        </div>
        <Link href="/invoices" className="finance-secondary-link">
          All invoices
        </Link>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Currently due</p>
          <p className="kpi-card-value finance-money">{formatPHP(totalDue)}</p>
          <p className="kpi-card-sub">
            {openCount} posted invoice balances
          </p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Past due</p>
          <p className="kpi-card-value finance-money">
            {formatPHP(overdueTotal)}
          </p>
          <p className="kpi-card-sub">{overdueCount} invoices past due</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Retention receivable</p>
          <p className="kpi-card-value finance-money">
            {formatPHP(totalRetention)}
          </p>
          <p className="kpi-card-sub">
            Withholding tax: {formatPHP(totalWithheld)}
          </p>
        </div>
      </div>

      <div className="finance-table-shell">
        {openRows.length === 0 ? (
          <div className="card-empty">
            <p>No posted customer receivables.</p>
            <Link href="/invoices">Review draft invoices</Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Project</th>
                <th>Due</th>
                <th>Aging</th>
                <th className="numeric">Currently due</th>
                <th>Posting</th>
              </tr>
            </thead>
            <tbody>
              {openRows.map((invoice) => {
                const age = daysFromToday(invoice.due_date)
                return (
                  <tr key={invoice.id}>
                    <td>
                      <Link
                        className="finance-entry-link"
                        href={`/invoices/${invoice.id}`}
                      >
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/crm/accounts/${invoice.account_id}`}>
                        {invoice.account_name}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/projects/${invoice.project_id}`}>
                        {invoice.project_name}
                      </Link>
                    </td>
                    <td>
                      {invoice.due_date
                        ? invoice.due_date.toLocaleDateString('en-PH')
                        : '—'}
                    </td>
                    <td>
                      <span
                        className={`finance-status ${
                          age !== null && age > 0
                            ? 'finance-status-overdue'
                            : 'finance-status-open'
                        }`}
                      >
                        {agingLabel(age)}
                      </span>
                    </td>
                    <td className="numeric">
                      {formatPHP(invoice.current_open_cents)}
                    </td>
                    <td>
                      <Link
                        className="finance-entry-link"
                        href={`/finance/journals/${invoice.issuance_journal_entry_id}`}
                      >
                        View journal
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="finance-callout finance-callout-muted">
        Balances derive from active posted receipt allocations. Manual payment
        status changes do not settle an invoice.
      </div>
    </div>
  )
}
