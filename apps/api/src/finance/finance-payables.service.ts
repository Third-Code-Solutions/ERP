import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cashAllocations,
  cashTransactions,
  projects,
  purchaseOrders,
  supplierBills,
  vendors,
} from '@third-code-erp/database/schema'
import {
  financePayablesResultSchema,
  type FinancePayablesQuery,
  type FinancePayablesResult,
} from '@third-code-erp/shared-types'
import {
  and,
  asc,
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

type SupplierBillStatus = 'draft' | 'posted' | 'reversed'

const SUPPLIER_BILL_STATUSES: SupplierBillStatus[] = [
  'draft',
  'posted',
  'reversed',
]

interface FinancePayablesDatabaseRow {
  id: string
  vendorBillNumber: string
  internalNumber: string | null
  status: SupplierBillStatus
  billDate: Date | string
  dueDate: Date | string | null
  subtotalCents: unknown
  inputVatCents: unknown
  withholdingTaxCents: unknown
  totalPayableCents: unknown
  paidCents: unknown
  openCents: unknown
  postedAt: Date | string | null
  postingJournalEntryId: string | null
  vendorId: string
  vendorName: string
  purchaseOrderId: string
  purchaseOrderNumber: string
  projectId: string
  projectName: string
}

interface FinancePayablesAggregateRow {
  total: unknown
  totalPayableCents: unknown
  totalPaidCents: unknown
  totalOpenCents: unknown
  overdueOpenCents: unknown
  overdueCount: unknown
  draftCount: unknown
  postedOpenCount: unknown
  agingCurrentCents: unknown
  aging1To30Cents: unknown
  aging31To60Cents: unknown
  aging61To90Cents: unknown
  aging90PlusCents: unknown
}

function cents(value: unknown): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Supplier payables amount is outside the safe integer range')
  }
  return result
}

function count(value: unknown): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Supplier payables count is outside the safe integer range')
  }
  return result
}

function dateOnly(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10)
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function allocationAmount() {
  return sql<number>`coalesce((
    select sum(${cashAllocations.amount_cents})
    from ${cashAllocations}
    inner join ${cashTransactions}
      on ${cashTransactions.id} = ${cashAllocations.cash_transaction_id}
     and ${cashTransactions.tenant_id} = ${cashAllocations.tenant_id}
    where ${cashAllocations.supplier_bill_id} = ${supplierBills.id}
      and ${cashAllocations.tenant_id} = ${supplierBills.tenant_id}
      and ${cashAllocations.allocation_type} = 'supplier_bill'
      and ${cashTransactions.status} = 'posted'
  ), 0)`
}

@Injectable()
export class FinancePayablesService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  async list(
    query: FinancePayablesQuery,
    principal: ErpPrincipal
  ): Promise<FinancePayablesResult> {
    this.assertReadEnabled(principal)

    const conditions: SQL[] = [
      eq(supplierBills.tenant_id, principal.tenantId),
      inArray(
        supplierBills.status,
        query.status ? [query.status] : SUPPLIER_BILL_STATUSES
      ),
    ]
    if (query.vendorId) {
      conditions.push(eq(supplierBills.vendor_id, query.vendorId))
    }
    if (query.projectId) {
      conditions.push(eq(supplierBills.project_id, query.projectId))
    }
    if (query.dueFrom) {
      conditions.push(gte(supplierBills.due_date, query.dueFrom))
    }
    if (query.dueTo) {
      conditions.push(lte(supplierBills.due_date, query.dueTo))
    }
    const whereClause = and(...conditions)
    const asOfDate = new Date().toISOString().slice(0, 10)
    const paid = allocationAmount()
    const open = sql<number>`case
      when ${supplierBills.status} = 'posted'
      then greatest(${supplierBills.total_payable_cents} - ${paid}, 0)
      else 0
    end`
    const overdue = sql<number>`case
      when ${supplierBills.status} = 'posted'
       and ${supplierBills.due_date} is not null
       and ${supplierBills.due_date} < ${asOfDate}::date
       and ${open} > 0
      then ${open}
      else 0
    end`
    const age = sql<number>`(${asOfDate}::date - ${supplierBills.due_date})`
    const agingCurrent = sql<number>`case
      when ${supplierBills.status} = 'posted'
       and ${open} > 0
       and (${supplierBills.due_date} is null or ${supplierBills.due_date} >= ${asOfDate}::date)
      then ${open}
      else 0
    end`
    const aging1To30 = sql<number>`case
      when ${supplierBills.status} = 'posted'
       and ${open} > 0
       and ${age} between 1 and 30
      then ${open}
      else 0
    end`
    const aging31To60 = sql<number>`case
      when ${supplierBills.status} = 'posted'
       and ${open} > 0
       and ${age} between 31 and 60
      then ${open}
      else 0
    end`
    const aging61To90 = sql<number>`case
      when ${supplierBills.status} = 'posted'
       and ${open} > 0
       and ${age} between 61 and 90
      then ${open}
      else 0
    end`
    const aging90Plus = sql<number>`case
      when ${supplierBills.status} = 'posted'
       and ${open} > 0
       and ${age} > 90
      then ${open}
      else 0
    end`

    const rowQuery = this.database.client
      .select({
        id: supplierBills.id,
        vendorBillNumber: supplierBills.vendor_bill_number,
        internalNumber: supplierBills.internal_number,
        status: supplierBills.status,
        billDate: supplierBills.bill_date,
        dueDate: supplierBills.due_date,
        subtotalCents: supplierBills.subtotal_cents,
        inputVatCents: supplierBills.input_vat_cents,
        withholdingTaxCents: supplierBills.withholding_tax_cents,
        totalPayableCents: supplierBills.total_payable_cents,
        paidCents: paid,
        openCents: open,
        postedAt: supplierBills.posted_at,
        postingJournalEntryId: supplierBills.posting_journal_entry_id,
        vendorId: vendors.id,
        vendorName: vendors.name,
        purchaseOrderId: purchaseOrders.id,
        purchaseOrderNumber: purchaseOrders.po_number,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(supplierBills)
      .innerJoin(
        vendors,
        and(
          eq(vendors.id, supplierBills.vendor_id),
          eq(vendors.tenant_id, supplierBills.tenant_id)
        )
      )
      .innerJoin(
        purchaseOrders,
        and(
          eq(purchaseOrders.id, supplierBills.purchase_order_id),
          eq(purchaseOrders.tenant_id, supplierBills.tenant_id)
        )
      )
      .innerJoin(
        projects,
        and(
          eq(projects.id, supplierBills.project_id),
          eq(projects.tenant_id, supplierBills.tenant_id)
        )
      )
      .where(whereClause)
      .orderBy(desc(supplierBills.bill_date), asc(vendors.name), desc(supplierBills.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)

    const aggregateQuery = this.database.client
      .select({
        total: sql<number>`count(*)::int`,
        totalPayableCents: sql<number>`coalesce(sum(${supplierBills.total_payable_cents}), 0)`,
        totalPaidCents: sql<number>`coalesce(sum(${paid}), 0)`,
        totalOpenCents: sql<number>`coalesce(sum(${open}), 0)`,
        overdueOpenCents: sql<number>`coalesce(sum(${overdue}), 0)`,
        overdueCount: sql<number>`count(*) filter (where ${overdue} > 0)::int`,
        draftCount: sql<number>`count(*) filter (where ${supplierBills.status} = 'draft')::int`,
        postedOpenCount: sql<number>`count(*) filter (where ${open} > 0)::int`,
        agingCurrentCents: sql<number>`coalesce(sum(${agingCurrent}), 0)`,
        aging1To30Cents: sql<number>`coalesce(sum(${aging1To30}), 0)`,
        aging31To60Cents: sql<number>`coalesce(sum(${aging31To60}), 0)`,
        aging61To90Cents: sql<number>`coalesce(sum(${aging61To90}), 0)`,
        aging90PlusCents: sql<number>`coalesce(sum(${aging90Plus}), 0)`,
      })
      .from(supplierBills)
      .innerJoin(
        vendors,
        and(
          eq(vendors.id, supplierBills.vendor_id),
          eq(vendors.tenant_id, supplierBills.tenant_id)
        )
      )
      .innerJoin(
        purchaseOrders,
        and(
          eq(purchaseOrders.id, supplierBills.purchase_order_id),
          eq(purchaseOrders.tenant_id, supplierBills.tenant_id)
        )
      )
      .innerJoin(
        projects,
        and(
          eq(projects.id, supplierBills.project_id),
          eq(projects.tenant_id, supplierBills.tenant_id)
        )
      )
      .where(whereClause)

    const [rows, aggregateRows] = await Promise.all([rowQuery, aggregateQuery])
    const aggregate = aggregateRows[0] as
      | FinancePayablesAggregateRow
      | undefined
    const total = count(aggregate?.total ?? 0)

    return financePayablesResultSchema.parse({
      tenantId: principal.tenantId,
      asOfDate,
      rows: (rows as FinancePayablesDatabaseRow[]).map((row) => ({
        id: row.id,
        vendorBillNumber: row.vendorBillNumber.trim().slice(0, 80),
        internalNumber: row.internalNumber
          ? row.internalNumber.trim().slice(0, 40)
          : null,
        status: row.status,
        billDate: dateOnly(row.billDate),
        dueDate: dateOnly(row.dueDate),
        subtotalCents: cents(row.subtotalCents),
        inputVatCents: cents(row.inputVatCents),
        withholdingTaxCents: cents(row.withholdingTaxCents),
        totalPayableCents: cents(row.totalPayableCents),
        paidCents: cents(row.paidCents),
        openCents: cents(row.openCents),
        postedAt: iso(row.postedAt),
        postingJournalEntryId: row.postingJournalEntryId,
        vendorId: row.vendorId,
        vendorName: row.vendorName.trim().slice(0, 255),
        purchaseOrderId: row.purchaseOrderId,
        purchaseOrderNumber: row.purchaseOrderNumber.trim().slice(0, 50),
        projectId: row.projectId,
        projectName: row.projectName.trim().slice(0, 255),
      })),
      total,
      totalPayableCents: cents(aggregate?.totalPayableCents ?? 0),
      totalPaidCents: cents(aggregate?.totalPaidCents ?? 0),
      totalOpenCents: cents(aggregate?.totalOpenCents ?? 0),
      overdueOpenCents: cents(aggregate?.overdueOpenCents ?? 0),
      overdueCount: count(aggregate?.overdueCount ?? 0),
      draftCount: count(aggregate?.draftCount ?? 0),
      postedOpenCount: count(aggregate?.postedOpenCount ?? 0),
      agingCurrentCents: cents(aggregate?.agingCurrentCents ?? 0),
      aging1To30Cents: cents(aggregate?.aging1To30Cents ?? 0),
      aging31To60Cents: cents(aggregate?.aging31To60Cents ?? 0),
      aging61To90Cents: cents(aggregate?.aging61To90Cents ?? 0),
      aging90PlusCents: cents(aggregate?.aging90PlusCents ?? 0),
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 1 : Math.ceil(total / query.limit),
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_PAYABLES_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_PAYABLES_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Supplier payables reads are not enabled for this tenant.'
      )
    }
  }
}
