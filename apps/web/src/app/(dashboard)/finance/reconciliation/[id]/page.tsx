import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import {
  BankStatementActions,
  type ReconciliationCandidate,
  type ReconciliationLine,
} from './statement-actions'

export const metadata: Metadata = { title: 'Bank statement reconciliation' }

interface StatementDetailRow {
  [key: string]: unknown
  id: string
  reference_number: string
  source_file_name: string
  source_sha256: string
  status: 'draft' | 'reconciled' | 'voided'
  statement_start: string
  statement_end: string
  currency: string
  opening_balance_cents: number
  closing_balance_cents: number
  cash_account_id: string
  cash_account_name: string
  cash_account_kind: 'bank' | 'e_wallet'
  reconciled_at: string | null
  voided_at: string | null
  void_reason: string | null
}

interface ReconciliationLineRow extends ReconciliationLine {
  [key: string]: unknown
}

interface ReconciliationCandidateRow extends ReconciliationCandidate {
  [key: string]: unknown
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not yet'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default async function BankStatementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.manage')
  const { id } = await params

  const statementRows = await db.execute<StatementDetailRow>(sql`
    select
      statement.id,
      statement.reference_number,
      statement.source_file_name,
      statement.source_sha256,
      statement.status,
      statement.statement_start,
      statement.statement_end,
      statement.currency,
      statement.opening_balance_cents,
      statement.closing_balance_cents,
      statement.reconciled_at,
      statement.voided_at,
      statement.void_reason,
      cash_account.id as cash_account_id,
      cash_account.name as cash_account_name,
      cash_account.account_kind as cash_account_kind
    from public.bank_statements statement
    join public.cash_accounts cash_account
      on cash_account.id = statement.cash_account_id
     and cash_account.tenant_id = statement.tenant_id
    where statement.id = ${id}::uuid
      and statement.tenant_id = ${profile.tenantId}::uuid
    limit 1
  `)
  const statement = statementRows[0]
  if (!statement) notFound()

  const [lineRows, candidateRows] = await Promise.all([
    db.execute<ReconciliationLineRow>(sql`
      select
        line.id,
        line.line_number,
        line.transaction_date,
        line.reference_number,
        line.description,
        line.amount_cents,
        line.matched_cash_transaction_id,
        line.matched_at,
        cash_tx.internal_number as matched_internal_number,
        cash_tx.reference_number as matched_reference_number,
        cash_tx.transaction_date as matched_transaction_date
      from public.bank_statement_lines line
      left join public.cash_transactions cash_tx
        on cash_tx.id = line.matched_cash_transaction_id
       and cash_tx.tenant_id = line.tenant_id
      where line.bank_statement_id = ${statement.id}::uuid
        and line.tenant_id = ${profile.tenantId}::uuid
      order by line.line_number
    `),
    statement.status === 'draft'
      ? db.execute<ReconciliationCandidateRow>(sql`
          select
            cash_tx.id,
            cash_tx.internal_number,
            cash_tx.reference_number,
            cash_tx.transaction_date,
            cash_tx.direction,
            cash_tx.amount_cents
          from public.cash_transactions cash_tx
          where cash_tx.tenant_id = ${profile.tenantId}::uuid
            and cash_tx.cash_account_id = ${statement.cash_account_id}::uuid
            and cash_tx.currency = ${statement.currency}
            and cash_tx.status = 'posted'
            and not exists (
              select 1
              from public.bank_statement_lines used_line
              where used_line.tenant_id = cash_tx.tenant_id
                and used_line.matched_cash_transaction_id = cash_tx.id
            )
            and exists (
              select 1
              from public.bank_statement_lines target_line
              where target_line.bank_statement_id = ${statement.id}::uuid
                and target_line.tenant_id = cash_tx.tenant_id
                and target_line.matched_cash_transaction_id is null
                and pg_catalog.abs(target_line.amount_cents)
                  = cash_tx.amount_cents
                and (
                  (
                    target_line.amount_cents > 0
                    and cash_tx.direction = 'receipt'
                  )
                  or (
                    target_line.amount_cents < 0
                    and cash_tx.direction = 'disbursement'
                  )
                )
            )
          order by cash_tx.transaction_date desc, cash_tx.created_at desc
        `)
      : Promise.resolve([] as ReconciliationCandidateRow[]),
  ])

  const lines = lineRows.map((line) => ({
    ...line,
    line_number: Number(line.line_number),
    amount_cents: Number(line.amount_cents),
  }))
  const candidates = candidateRows.map((candidate) => ({
    ...candidate,
    amount_cents: Number(candidate.amount_cents),
  }))
  const movementCents = lines.reduce(
    (total, line) => total + line.amount_cents,
    0
  )
  const matchedCount = lines.filter(
    (line) => line.matched_cash_transaction_id
  ).length

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/finance/reconciliation">Bank reconciliation</Link>
        <span>/</span>
        <span>{statement.reference_number}</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">External cash evidence</p>
          <h1 className="page-title">{statement.reference_number}</h1>
          <p className="page-subtitle">
            {statement.cash_account_name} / {statement.statement_start} to{' '}
            {statement.statement_end}
          </p>
        </div>
        <span
          className={`finance-status finance-status-${statement.status}`}
        >
          {statement.status}
        </span>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Opening balance</p>
          <p className="kpi-card-value finance-money-kpi">
            {formatMoney(
              Number(statement.opening_balance_cents),
              statement.currency
            )}
          </p>
          <p className="kpi-card-sub">{statement.currency}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Signed movement</p>
          <p className="kpi-card-value finance-money-kpi">
            {formatMoney(movementCents, statement.currency)}
          </p>
          <p className="kpi-card-sub">{lines.length} statement lines</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Closing balance</p>
          <p className="kpi-card-value finance-money-kpi">
            {formatMoney(
              Number(statement.closing_balance_cents),
              statement.currency
            )}
          </p>
          <p className="kpi-card-sub">Validated roll-forward</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Matched</p>
          <p className="kpi-card-value">
            {matchedCount} / {lines.length}
          </p>
          <p className="kpi-card-sub">
            {lines.length - matchedCount} exceptions remain
          </p>
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Source provenance</p>
            <h2>Imported file evidence</h2>
          </div>
          <p>The digest identifies the exact uploaded bytes.</p>
        </div>
        <div className="reconciliation-proof-grid">
          <div>
            <span>Source file</span>
            <strong>{statement.source_file_name}</strong>
          </div>
          <div>
            <span>SHA-256</span>
            <code>{statement.source_sha256}</code>
          </div>
          <div>
            <span>Channel</span>
            <strong>{statement.cash_account_kind.replace('_', ' ')}</strong>
          </div>
          <div>
            <span>Reconciled</span>
            <strong>{formatTimestamp(statement.reconciled_at)}</strong>
          </div>
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Line-by-line proof</p>
            <h2>Statement matching</h2>
          </div>
          <p>
            Auto-match accepts one exact candidate only. Exceptions stay
            manual.
          </p>
        </div>
        <BankStatementActions
          statementId={statement.id}
          status={statement.status}
          currency={statement.currency}
          lines={lines}
          candidates={candidates}
        />
      </section>

      {statement.status === 'voided' && (
        <section className="finance-section">
          <div className="finance-section-heading">
            <div>
              <p className="finance-eyebrow">Correction evidence</p>
              <h2>Void record</h2>
            </div>
            <p>{formatTimestamp(statement.voided_at)}</p>
          </div>
          <p className="finance-control-note reconciliation-void-note">
            {statement.void_reason}
          </p>
        </section>
      )}
    </div>
  )
}
