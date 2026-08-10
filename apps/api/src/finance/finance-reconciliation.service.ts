import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  bankStatementLines,
  bankStatements,
  cashAccounts,
} from '@third-code-erp/database/schema'
import {
  financeReconciliationResultSchema,
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
