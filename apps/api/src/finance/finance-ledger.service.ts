import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  accounts,
  journalEntries,
  journalLines,
  ledgerAccounts,
  projects,
  vendors,
} from '@third-code-erp/database/schema'
import {
  financeLedgerResultSchema,
  type FinanceLedgerQuery,
  type FinanceLedgerResult,
} from '@third-code-erp/shared-types'
import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value
}

function text(value: string | null, max: number): string | null {
  return value === null ? null : value.trim().slice(0, max)
}

function cents(value: unknown): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Finance ledger amount is outside the safe integer range')
  }
  return result
}

@Injectable()
export class FinanceLedgerService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  async list(
    query: FinanceLedgerQuery,
    principal: ErpPrincipal
  ): Promise<FinanceLedgerResult> {
    this.assertReadEnabled(principal)

    const conditions: SQL[] = [
      eq(journalLines.tenant_id, principal.tenantId),
      eq(journalEntries.tenant_id, principal.tenantId),
      eq(journalEntries.status, 'posted'),
    ]
    if (query.accountId) {
      conditions.push(eq(journalLines.ledger_account_id, query.accountId))
    }
    if (query.customerId) {
      conditions.push(eq(journalLines.business_account_id, query.customerId))
    }
    if (query.vendorId) {
      conditions.push(eq(journalLines.vendor_id, query.vendorId))
    }
    if (query.projectId) {
      conditions.push(eq(journalLines.project_id, query.projectId))
    }
    if (query.from) {
      conditions.push(gte(journalEntries.posting_date, query.from))
    }
    if (query.to) {
      conditions.push(lte(journalEntries.posting_date, query.to))
    }
    const whereClause = and(...conditions)

    const rowSelect = this.database.client
      .select({
        id: journalLines.id,
        entryId: journalEntries.id,
        entryNumber: journalEntries.entry_number,
        postingDate: journalEntries.posting_date,
        entryDescription: journalEntries.description,
        accountCode: ledgerAccounts.code,
        accountName: ledgerAccounts.name,
        projectId: projects.id,
        projectName: projects.name,
        customerId: accounts.id,
        customerName: accounts.name,
        vendorId: vendors.id,
        vendorName: vendors.name,
        lineDescription: journalLines.description,
        debitCents: journalLines.debit_cents,
        creditCents: journalLines.credit_cents,
      })
      .from(journalLines)
    const rowQuery = rowSelect
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
      .where(whereClause)
      .orderBy(
        desc(journalEntries.posting_date),
        desc(journalEntries.entry_number),
        asc(journalLines.line_number),
        asc(journalLines.id)
      )
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)

    const countSelect = this.database.client
      .select({ count: sql<number>`count(*)::int` })
      .from(journalLines)
    const countQuery = countSelect
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, journalLines.journal_entry_id),
          eq(journalEntries.tenant_id, journalLines.tenant_id)
        )
      )
      .where(whereClause)

    const totalsSelect = this.database.client
      .select({
        debit: sql<number>`coalesce(sum(${journalLines.debit_cents}), 0)`,
        credit: sql<number>`coalesce(sum(${journalLines.credit_cents}), 0)`,
      })
      .from(journalLines)
    const totalsQuery = totalsSelect
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, journalLines.journal_entry_id),
          eq(journalEntries.tenant_id, journalLines.tenant_id)
        )
      )
      .where(whereClause)

    const [rows, countRows, totalsRows, ledgerAccountRows, businessAccountRows, vendorRows] =
      await Promise.all([
        rowQuery,
        countQuery,
        totalsQuery,
        this.database.client
          .select({
            id: ledgerAccounts.id,
            code: ledgerAccounts.code,
            name: ledgerAccounts.name,
          })
          .from(ledgerAccounts)
          .where(eq(ledgerAccounts.tenant_id, principal.tenantId))
          .orderBy(asc(ledgerAccounts.code))
          .limit(1_000),
        this.database.client
          .select({ id: accounts.id, name: accounts.name })
          .from(accounts)
          .where(eq(accounts.tenant_id, principal.tenantId))
          .orderBy(asc(accounts.name))
          .limit(1_000),
        this.database.client
          .select({ id: vendors.id, name: vendors.name })
          .from(vendors)
          .where(eq(vendors.tenant_id, principal.tenantId))
          .orderBy(asc(vendors.name))
          .limit(1_000),
      ])

    const total = Number(countRows[0]?.count ?? 0)
    const totalPages = total === 0 ? 1 : Math.ceil(total / query.limit)
    const totals = totalsRows[0]

    return financeLedgerResultSchema.parse({
      rows: rows.map((row) => ({
        id: row.id,
        entryId: row.entryId,
        entryNumber: text(row.entryNumber, 40),
        postingDate: dateOnly(row.postingDate),
        entryDescription: row.entryDescription.trim().slice(0, 2_000),
        accountCode: row.accountCode.trim(),
        accountName: row.accountName.trim(),
        projectId: row.projectId,
        projectName: text(row.projectName, 255),
        customerId: row.customerId,
        customerName: text(row.customerName, 255),
        vendorId: row.vendorId,
        vendorName: text(row.vendorName, 255),
        lineDescription: text(row.lineDescription, 2_000),
        debitCents: cents(row.debitCents),
        creditCents: cents(row.creditCents),
      })),
      total,
      totalDebitCents: cents(totals?.debit ?? 0),
      totalCreditCents: cents(totals?.credit ?? 0),
      page: query.page,
      limit: query.limit,
      totalPages,
      ledgerAccounts: ledgerAccountRows,
      businessAccounts: businessAccountRows,
      vendors: vendorRows,
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_LEDGER_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_LEDGER_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Finance ledger reads are not enabled for this tenant.'
      )
    }
  }
}
