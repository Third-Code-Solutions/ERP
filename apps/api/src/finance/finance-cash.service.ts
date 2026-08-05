import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  accounts,
  cashAccounts,
  cashTransactions,
  vendors,
} from '@third-code-erp/database/schema'
import {
  financeCashResultSchema,
  type FinanceCashQuery,
  type FinanceCashResult,
} from '@third-code-erp/shared-types'
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

type CashDirection = 'receipt' | 'disbursement'
type CashStatus = 'draft' | 'posted' | 'reversed'

const CASH_DIRECTIONS: CashDirection[] = ['receipt', 'disbursement']
const CASH_STATUSES: CashStatus[] = ['draft', 'posted', 'reversed']

interface FinanceCashDatabaseRow {
  id: string
  internalNumber: string | null
  referenceNumber: string
  direction: CashDirection
  status: CashStatus
  transactionDate: Date | string
  currency: string
  amountCents: unknown
  postingJournalEntryId: string | null
  postedAt: Date | string | null
  cashAccountId: string
  cashAccountName: string
  businessAccountId: string | null
  businessAccountName: string | null
  vendorId: string | null
  vendorName: string | null
}

interface FinanceCashAggregateRow {
  total: unknown
  postedReceiptCents: unknown
  postedDisbursementCents: unknown
  draftCount: unknown
  postedCount: unknown
  reversedCount: unknown
}

function cents(value: unknown): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Cash transaction amount is outside the safe integer range')
  }
  return result
}

function count(value: unknown): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Cash transaction count is outside the safe integer range')
  }
  return result
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

@Injectable()
export class FinanceCashService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  async list(
    query: FinanceCashQuery,
    principal: ErpPrincipal
  ): Promise<FinanceCashResult> {
    this.assertReadEnabled(principal)

    const conditions: SQL[] = [
      eq(cashTransactions.tenant_id, principal.tenantId),
      inArray(
        cashTransactions.direction,
        query.direction ? [query.direction] : CASH_DIRECTIONS
      ),
      inArray(cashTransactions.status, query.status ? [query.status] : CASH_STATUSES),
    ]
    if (query.cashAccountId) {
      conditions.push(eq(cashTransactions.cash_account_id, query.cashAccountId))
    }
    if (query.fromDate) {
      conditions.push(gte(cashTransactions.transaction_date, query.fromDate))
    }
    if (query.toDate) {
      conditions.push(lte(cashTransactions.transaction_date, query.toDate))
    }
    const whereClause = and(...conditions)

    const rowQuery = this.database.client
      .select({
        id: cashTransactions.id,
        internalNumber: cashTransactions.internal_number,
        referenceNumber: cashTransactions.reference_number,
        direction: cashTransactions.direction,
        status: cashTransactions.status,
        transactionDate: cashTransactions.transaction_date,
        currency: cashTransactions.currency,
        amountCents: cashTransactions.amount_cents,
        postingJournalEntryId: cashTransactions.posting_journal_entry_id,
        postedAt: cashTransactions.posted_at,
        cashAccountId: cashAccounts.id,
        cashAccountName: cashAccounts.name,
        businessAccountId: accounts.id,
        businessAccountName: accounts.name,
        vendorId: vendors.id,
        vendorName: vendors.name,
      })
      .from(cashTransactions)
      .innerJoin(
        cashAccounts,
        and(
          eq(cashAccounts.id, cashTransactions.cash_account_id),
          eq(cashAccounts.tenant_id, cashTransactions.tenant_id)
        )
      )
      .leftJoin(
        accounts,
        and(
          eq(accounts.id, cashTransactions.business_account_id),
          eq(accounts.tenant_id, cashTransactions.tenant_id)
        )
      )
      .leftJoin(
        vendors,
        and(
          eq(vendors.id, cashTransactions.vendor_id),
          eq(vendors.tenant_id, cashTransactions.tenant_id)
        )
      )
      .where(whereClause)
      .orderBy(desc(cashTransactions.transaction_date), desc(cashTransactions.created_at))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)

    const aggregateQuery = this.database.client
      .select({
        total: sql<number>`count(*)::int`,
        postedReceiptCents: sql<number>`coalesce(sum(case
          when ${cashTransactions.status} = 'posted'
           and ${cashTransactions.direction} = 'receipt'
          then ${cashTransactions.amount_cents}
          else 0
        end), 0)`,
        postedDisbursementCents: sql<number>`coalesce(sum(case
          when ${cashTransactions.status} = 'posted'
           and ${cashTransactions.direction} = 'disbursement'
          then ${cashTransactions.amount_cents}
          else 0
        end), 0)`,
        draftCount: sql<number>`count(*) filter (where ${cashTransactions.status} = 'draft')::int`,
        postedCount: sql<number>`count(*) filter (where ${cashTransactions.status} = 'posted')::int`,
        reversedCount: sql<number>`count(*) filter (where ${cashTransactions.status} = 'reversed')::int`,
      })
      .from(cashTransactions)
      .innerJoin(
        cashAccounts,
        and(
          eq(cashAccounts.id, cashTransactions.cash_account_id),
          eq(cashAccounts.tenant_id, cashTransactions.tenant_id)
        )
      )
      .leftJoin(
        accounts,
        and(
          eq(accounts.id, cashTransactions.business_account_id),
          eq(accounts.tenant_id, cashTransactions.tenant_id)
        )
      )
      .leftJoin(
        vendors,
        and(
          eq(vendors.id, cashTransactions.vendor_id),
          eq(vendors.tenant_id, cashTransactions.tenant_id)
        )
      )
      .where(whereClause)

    const [rows, aggregateRows] = await Promise.all([rowQuery, aggregateQuery])
    const aggregate = aggregateRows[0] as FinanceCashAggregateRow | undefined
    const total = count(aggregate?.total ?? 0)

    return financeCashResultSchema.parse({
      tenantId: principal.tenantId,
      rows: (rows as FinanceCashDatabaseRow[]).map((row) => ({
        id: row.id,
        internalNumber: row.internalNumber
          ? row.internalNumber.trim().slice(0, 40)
          : null,
        referenceNumber: row.referenceNumber.trim().slice(0, 100),
        direction: row.direction,
        status: row.status,
        transactionDate: dateOnly(row.transactionDate),
        currency: row.currency.trim().slice(0, 3),
        amountCents: cents(row.amountCents),
        postingJournalEntryId: row.postingJournalEntryId,
        postedAt: iso(row.postedAt),
        cashAccountId: row.cashAccountId,
        cashAccountName: row.cashAccountName.trim().slice(0, 160),
        businessAccountId: row.businessAccountId,
        businessAccountName: row.businessAccountName
          ? row.businessAccountName.trim().slice(0, 255)
          : null,
        vendorId: row.vendorId,
        vendorName: row.vendorName ? row.vendorName.trim().slice(0, 255) : null,
      })),
      total,
      postedReceiptCents: cents(aggregate?.postedReceiptCents ?? 0),
      postedDisbursementCents: cents(aggregate?.postedDisbursementCents ?? 0),
      draftCount: count(aggregate?.draftCount ?? 0),
      postedCount: count(aggregate?.postedCount ?? 0),
      reversedCount: count(aggregate?.reversedCount ?? 0),
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 1 : Math.ceil(total / query.limit),
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>('ERP_FINANCE_CASH_READS_ENABLED', false)
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_CASH_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cash transaction reads are not enabled for this tenant.'
      )
    }
  }
}
