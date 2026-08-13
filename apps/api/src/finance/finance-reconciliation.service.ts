import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  bankStatementLines,
  bankStatements,
  cashAccounts,
} from '@third-code-erp/database/schema'
import {
  financeReconciliationDetailResultSchema,
  financeReconciliationResultSchema,
  type FinanceReconciliationDetailResult,
  type FinanceReconciliationQuery,
  type FinanceReconciliationResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

type StatementStatus = 'draft' | 'reconciled' | 'voided'

interface FinanceReconciliationDatabaseRow {
  id: string
  referenceNumber: string
  sourceFileName: string
  status: StatementStatus
  statementStart: Date | string
  statementEnd: Date | string
  currency: string
  closingBalanceCents: unknown
  cashAccountId: string
  cashAccountName: string
  lineCount: unknown
  matchedCount: unknown
  createdAt: Date | string
}

interface FinanceReconciliationDetailStatementRow {
  [key: string]: unknown
  id: string
  reference_number: string
  source_file_name: string
  source_sha256: string
  status: StatementStatus
  statement_start: string
  statement_end: string
  currency: string
  opening_balance_cents: unknown
  closing_balance_cents: unknown
  cash_account_id: string
  cash_account_name: string
  cash_account_kind: 'bank' | 'e_wallet'
  reconciled_at: string | null
  voided_at: string | null
  void_reason: string | null
}

interface FinanceReconciliationDetailLineRow {
  [key: string]: unknown
  id: string
  line_number: unknown
  transaction_date: string
  reference_number: string | null
  description: string
  amount_cents: unknown
  matched_cash_transaction_id: string | null
  matched_at: string | null
  matched_internal_number: string | null
  matched_reference_number: string | null
  matched_transaction_date: string | null
}

interface FinanceReconciliationDetailCandidateRow {
  [key: string]: unknown
  id: string
  internal_number: string | null
  reference_number: string
  transaction_date: string
  direction: 'receipt' | 'disbursement'
  amount_cents: unknown
}

const MAX_DETAIL_ROWS = 500

function count(value: unknown): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Bank reconciliation count is outside the safe integer range')
  }
  return result
}

function signedCents(value: unknown): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result)) {
    throw new Error(
      'Bank reconciliation balance is outside the safe integer range'
    )
  }
  return result
}

function dateOnly(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10)
}

@Injectable()
export class FinanceReconciliationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async list(
    query: FinanceReconciliationQuery,
    principal: ErpPrincipal
  ): Promise<FinanceReconciliationResult> {
    this.assertReadEnabled(principal)

    const tenantWhere = eq(
      bankStatements.tenant_id,
      principal.tenantId
    )
    const rowsPromise = this.database.client
      .select({
        id: bankStatements.id,
        referenceNumber: bankStatements.reference_number,
        sourceFileName: bankStatements.source_file_name,
        status: bankStatements.status,
        statementStart: bankStatements.statement_start,
        statementEnd: bankStatements.statement_end,
        currency: bankStatements.currency,
        closingBalanceCents: bankStatements.closing_balance_cents,
        cashAccountId: cashAccounts.id,
        cashAccountName: cashAccounts.name,
        lineCount: sql<number>`count(${bankStatementLines.id})::int`,
        matchedCount: sql<number>`count(${bankStatementLines.matched_cash_transaction_id})::int`,
        createdAt: bankStatements.created_at,
      })
      .from(bankStatements)
      .innerJoin(
        cashAccounts,
        and(
          eq(cashAccounts.id, bankStatements.cash_account_id),
          eq(cashAccounts.tenant_id, bankStatements.tenant_id)
        )
      )
      .leftJoin(
        bankStatementLines,
        and(
          eq(bankStatementLines.bank_statement_id, bankStatements.id),
          eq(bankStatementLines.tenant_id, bankStatements.tenant_id)
        )
      )
      .where(tenantWhere)
      .groupBy(
        bankStatements.id,
        cashAccounts.id,
        cashAccounts.name
      )
      .orderBy(
        desc(bankStatements.statement_end),
        desc(bankStatements.created_at)
      )
      .limit(query.limit)

    const totalPromise = this.database.client
      .select({ total: sql<number>`count(*)::int` })
      .from(bankStatements)
      .where(tenantWhere)

    const [rawRows, totalRows] = await Promise.all([
      rowsPromise,
      totalPromise,
    ])
    const rows = (rawRows as FinanceReconciliationDatabaseRow[]).map((row) => ({
      id: row.id,
      referenceNumber: row.referenceNumber.trim().slice(0, 120),
      sourceFileName: row.sourceFileName.trim().slice(0, 255),
      status: row.status,
      statementStart: dateOnly(row.statementStart),
      statementEnd: dateOnly(row.statementEnd),
      currency: row.currency.trim().slice(0, 3),
      closingBalanceCents: signedCents(row.closingBalanceCents),
      cashAccountId: row.cashAccountId,
      cashAccountName: row.cashAccountName.trim().slice(0, 160),
      lineCount: count(row.lineCount),
      matchedCount: count(row.matchedCount),
    }))
    const total = count(totalRows[0]?.total ?? 0)
    const draftCount = rows.filter((row) => row.status === 'draft').length
    const reconciledCount = rows.filter(
      (row) => row.status === 'reconciled'
    ).length
    const openExceptions = rows.reduce(
      (sum, row) =>
        sum +
        (row.status === 'draft'
          ? Math.max(0, row.lineCount - row.matchedCount)
          : 0),
      0
    )
    const channels = new Set(rows.map((row) => row.cashAccountId)).size

    return financeReconciliationResultSchema.parse({
      tenantId: principal.tenantId,
      rows,
      total,
      truncated: total > rows.length,
      draftCount,
      reconciledCount,
      openExceptions,
      channels,
    })
  }

  async read(
    statementId: string,
    principal: ErpPrincipal
  ): Promise<FinanceReconciliationDetailResult> {
    this.assertReadEnabled(principal)

    const [statement] = await this.database.client.execute<
      FinanceReconciliationDetailStatementRow
    >(sql`
      select
        statement.id,
        statement.reference_number,
        statement.source_file_name,
        statement.source_sha256,
        statement.status::text,
        statement.statement_start::text,
        statement.statement_end::text,
        statement.currency,
        statement.opening_balance_cents,
        statement.closing_balance_cents,
        to_char(
          statement.reconciled_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) as reconciled_at,
        to_char(
          statement.voided_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) as voided_at,
        statement.void_reason,
        cash_account.id as cash_account_id,
        cash_account.name as cash_account_name,
        cash_account.account_kind::text as cash_account_kind
      from public.bank_statements statement
      join public.cash_accounts cash_account
        on cash_account.id = statement.cash_account_id
       and cash_account.tenant_id = statement.tenant_id
      where statement.id = ${statementId}::uuid
        and statement.tenant_id = ${principal.tenantId}::uuid
      limit 1
    `)
    if (!statement) throw new NotFoundException('Bank statement not found')

    const [lineRows, candidateRows] = await Promise.all([
      this.database.client.execute<FinanceReconciliationDetailLineRow>(sql`
        select
          line.id,
          line.line_number,
          line.transaction_date::text,
          line.reference_number,
          line.description,
          line.amount_cents,
          line.matched_cash_transaction_id,
          to_char(
            line.matched_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) as matched_at,
          cash_tx.internal_number as matched_internal_number,
          cash_tx.reference_number as matched_reference_number,
          cash_tx.transaction_date::text as matched_transaction_date
        from public.bank_statement_lines line
        left join public.cash_transactions cash_tx
          on cash_tx.id = line.matched_cash_transaction_id
         and cash_tx.tenant_id = line.tenant_id
        where line.bank_statement_id = ${statementId}::uuid
          and line.tenant_id = ${principal.tenantId}::uuid
        order by line.line_number
        limit ${MAX_DETAIL_ROWS + 1}
      `),
      statement.status === 'draft'
        ? this.database.client.execute<
            FinanceReconciliationDetailCandidateRow
          >(sql`
            select
              cash_tx.id,
              cash_tx.internal_number,
              cash_tx.reference_number,
              cash_tx.transaction_date::text,
              cash_tx.direction::text,
              cash_tx.amount_cents
            from public.cash_transactions cash_tx
            where cash_tx.tenant_id = ${principal.tenantId}::uuid
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
                where target_line.bank_statement_id = ${statementId}::uuid
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
            limit ${MAX_DETAIL_ROWS + 1}
          `)
        : Promise.resolve([] as FinanceReconciliationDetailCandidateRow[]),
    ])

    if (lineRows.length > MAX_DETAIL_ROWS) {
      throw new BadRequestException(
        'Bank statement detail exceeds the line display limit'
      )
    }
    if (candidateRows.length > MAX_DETAIL_ROWS) {
      throw new BadRequestException(
        'Bank statement detail exceeds the candidate display limit'
      )
    }

    return financeReconciliationDetailResultSchema.parse({
      tenantId: principal.tenantId,
      statement: {
        id: statement.id,
        referenceNumber: statement.reference_number.trim().slice(0, 120),
        sourceFileName: statement.source_file_name.trim().slice(0, 255),
        sourceSha256: statement.source_sha256,
        status: statement.status,
        statementStart: statement.statement_start.slice(0, 10),
        statementEnd: statement.statement_end.slice(0, 10),
        currency: statement.currency.trim().slice(0, 3),
        openingBalanceCents: signedCents(statement.opening_balance_cents),
        closingBalanceCents: signedCents(statement.closing_balance_cents),
        cashAccountId: statement.cash_account_id,
        cashAccountName: statement.cash_account_name.trim().slice(0, 160),
        cashAccountKind: statement.cash_account_kind,
        reconciledAt: statement.reconciled_at,
        voidedAt: statement.voided_at,
        voidReason: statement.void_reason?.trim().slice(0, 2_000) ?? null,
      },
      lines: lineRows.map((line) => ({
        id: line.id,
        lineNumber: count(line.line_number),
        transactionDate: line.transaction_date.slice(0, 10),
        referenceNumber: line.reference_number?.trim().slice(0, 120) ?? null,
        description: line.description.trim().slice(0, 2_000),
        amountCents: signedCents(line.amount_cents),
        matchedCashTransactionId: line.matched_cash_transaction_id,
        matchedAt: line.matched_at,
        matchedInternalNumber:
          line.matched_internal_number?.trim().slice(0, 40) ?? null,
        matchedReferenceNumber:
          line.matched_reference_number?.trim().slice(0, 100) ?? null,
        matchedTransactionDate:
          line.matched_transaction_date?.slice(0, 10) ?? null,
      })),
      candidates: candidateRows.map((candidate) => ({
        id: candidate.id,
        internalNumber: candidate.internal_number?.trim().slice(0, 40) ?? null,
        referenceNumber: candidate.reference_number.trim().slice(0, 100),
        transactionDate: candidate.transaction_date.slice(0, 10),
        direction: candidate.direction,
        amountCents: count(candidate.amount_cents),
      })),
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_RECONCILIATION_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_RECONCILIATION_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Bank reconciliation reads are not enabled for this tenant.'
      )
    }
  }
}
