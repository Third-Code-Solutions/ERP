import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  accounts,
  cashAllocations,
  cashTransactions,
  invoices,
  projects,
} from '@third-code-erp/database/schema'
import {
  financeReceivablesResultSchema,
  type FinanceReceivablesQuery,
  type FinanceReceivablesResult,
} from '@third-code-erp/shared-types'
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

type OpenInvoiceStatus = 'issued' | 'partial_payment' | 'overdue'

const OPEN_STATUSES: OpenInvoiceStatus[] = [
  'issued',
  'partial_payment',
  'overdue',
]

type AllocationType = 'customer_current_due' | 'customer_retention'

interface FinanceReceivablesDatabaseRow {
  id: string
  invoiceNumber: string
  status: OpenInvoiceStatus
  netAmountCents: unknown
  retentionCents: unknown
  withholdingTaxCents: unknown
  currentAllocatedCents: unknown
  retentionAllocatedCents: unknown
  currentOpenCents: unknown
  retentionOpenCents: unknown
  dueDate: Date | string | null
  issuedAt: Date | string | null
  issuanceJournalEntryId: string
  projectId: string
  projectName: string
  accountId: string
  accountName: string
}

interface FinanceReceivablesAggregateRow {
  total: unknown
  totalDueCents: unknown
  totalRetentionCents: unknown
  totalWithheldCents: unknown
  overdueTotalCents: unknown
  overdueCount: unknown
}

function cents(value: unknown): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Customer receivables amount is outside the safe integer range')
  }
  return result
}

function count(value: unknown): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Customer receivables count is outside the safe integer range')
  }
  return result
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function allocationAmount(type: AllocationType) {
  return sql<number>`coalesce((
    select sum(${cashAllocations.amount_cents})
    from ${cashAllocations}
    inner join ${cashTransactions}
      on ${cashTransactions.id} = ${cashAllocations.cash_transaction_id}
     and ${cashTransactions.tenant_id} = ${cashAllocations.tenant_id}
    where ${cashAllocations.invoice_id} = ${invoices.id}
      and ${cashAllocations.tenant_id} = ${invoices.tenant_id}
      and ${cashAllocations.allocation_type} = ${type}
      and ${cashTransactions.status} = 'posted'
  ), 0)`
}

@Injectable()
export class FinanceReceivablesService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  async list(
    query: FinanceReceivablesQuery,
    principal: ErpPrincipal
  ): Promise<FinanceReceivablesResult> {
    this.assertReadEnabled(principal)

    const conditions: SQL[] = [
      eq(invoices.tenant_id, principal.tenantId),
      isNotNull(invoices.issuance_journal_entry_id),
      inArray(invoices.status, query.status ? [query.status] : OPEN_STATUSES),
    ]
    if (query.accountId) {
      conditions.push(eq(invoices.account_id, query.accountId))
    }
    if (query.projectId) {
      conditions.push(eq(invoices.project_id, query.projectId))
    }
    if (query.dueFrom) {
      conditions.push(
        gte(
          invoices.due_date,
          new Date(`${query.dueFrom}T00:00:00.000Z`)
        )
      )
    }
    if (query.dueTo) {
      conditions.push(
        lte(
          invoices.due_date,
          new Date(`${query.dueTo}T23:59:59.999Z`)
        )
      )
    }
    const whereClause = and(...conditions)
    const asOfDate = new Date().toISOString().slice(0, 10)
    const asOfTimestamp = new Date(`${asOfDate}T00:00:00.000Z`)
    const currentAllocated = allocationAmount('customer_current_due')
    const retentionAllocated = allocationAmount('customer_retention')
    const currentOpen = sql<number>`greatest(
      ${invoices.net_amount_cents} - ${currentAllocated},
      0
    )`
    const retentionOpen = sql<number>`greatest(
      ${invoices.retention_cents} - ${retentionAllocated},
      0
    )`

    const rowQuery = this.database.client
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoice_number,
        status: invoices.status,
        netAmountCents: invoices.net_amount_cents,
        retentionCents: invoices.retention_cents,
        withholdingTaxCents: invoices.withholding_tax_cents,
        currentAllocatedCents: currentAllocated,
        retentionAllocatedCents: retentionAllocated,
        currentOpenCents: currentOpen,
        retentionOpenCents: retentionOpen,
        dueDate: invoices.due_date,
        issuedAt: invoices.issued_at,
        issuanceJournalEntryId: invoices.issuance_journal_entry_id,
        projectId: projects.id,
        projectName: projects.name,
        accountId: accounts.id,
        accountName: accounts.name,
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
      .where(whereClause)
      .orderBy(desc(invoices.due_date), desc(invoices.issued_at), desc(invoices.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)

    const aggregateQuery = this.database.client
      .select({
        total: sql<number>`count(*)::int`,
        totalDueCents: sql<number>`coalesce(sum(${currentOpen}), 0)`,
        totalRetentionCents: sql<number>`coalesce(sum(${retentionOpen}), 0)`,
        totalWithheldCents: sql<number>`coalesce(sum(${invoices.withholding_tax_cents}), 0)`,
        overdueTotalCents: sql<number>`coalesce(sum(
          case
            when ${invoices.due_date} is not null
             and ${invoices.due_date} < ${asOfTimestamp}
            then ${currentOpen}
            else 0
          end
        ), 0)`,
        overdueCount: sql<number>`count(*) filter (
          where ${invoices.due_date} is not null
            and ${invoices.due_date} < ${asOfTimestamp}
        )::int`,
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
      .where(whereClause)

    const [rows, aggregateRows] = await Promise.all([rowQuery, aggregateQuery])
    const aggregate = aggregateRows[0] as
      | FinanceReceivablesAggregateRow
      | undefined
    const total = count(aggregate?.total ?? 0)

    return financeReceivablesResultSchema.parse({
      tenantId: principal.tenantId,
      asOfDate,
      rows: (rows as FinanceReceivablesDatabaseRow[]).map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber.trim().slice(0, 50),
        status: row.status,
        netAmountCents: cents(row.netAmountCents),
        retentionCents: cents(row.retentionCents),
        withholdingTaxCents: cents(row.withholdingTaxCents),
        currentAllocatedCents: cents(row.currentAllocatedCents),
        retentionAllocatedCents: cents(row.retentionAllocatedCents),
        currentOpenCents: cents(row.currentOpenCents),
        retentionOpenCents: cents(row.retentionOpenCents),
        dueDate: iso(row.dueDate),
        issuedAt: iso(row.issuedAt),
        issuanceJournalEntryId: row.issuanceJournalEntryId,
        projectId: row.projectId,
        projectName: row.projectName.trim().slice(0, 255),
        accountId: row.accountId,
        accountName: row.accountName.trim().slice(0, 255),
      })),
      total,
      totalDueCents: cents(aggregate?.totalDueCents ?? 0),
      totalRetentionCents: cents(aggregate?.totalRetentionCents ?? 0),
      totalWithheldCents: cents(aggregate?.totalWithheldCents ?? 0),
      overdueTotalCents: cents(aggregate?.overdueTotalCents ?? 0),
      overdueCount: count(aggregate?.overdueCount ?? 0),
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 1 : Math.ceil(total / query.limit),
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_RECEIVABLES_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Customer receivables reads are not enabled for this tenant.'
      )
    }
  }
}
