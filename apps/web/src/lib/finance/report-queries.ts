import { db } from '@third-code-erp/database'
import {
  accounts,
  fiscalPeriods,
  invoices,
  journalEntries,
  journalLines,
  ledgerAccounts,
  projects,
  supplierBills,
  vendors,
} from '@third-code-erp/database/schema'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm'
import { manilaDay, utcDay } from './dates'
import { toCents } from './money'
import {
  buildTrialBalance,
  type FiscalPeriodBounds,
  type TrialBalance,
  type TrialBalanceRange,
} from './trial-balance'

/**
 * Every query here is scoped by the session tenant that callers pass in, and
 * every joined or sub-queried tenant table binds that tenant itself. Journal
 * lines are summed only from POSTED entries; a reversal is its own posted entry
 * with the sides swapped, so no source_type filter is applied.
 */

const PERIOD_LIST_LIMIT = 120

export interface FiscalPeriodOption extends FiscalPeriodBounds {
  id: string
  name: string
}

export async function listFiscalPeriods(
  tenantId: string
): Promise<FiscalPeriodOption[]> {
  const rows = await db
    .select({
      id: fiscalPeriods.id,
      name: fiscalPeriods.name,
      startsOn: fiscalPeriods.starts_on,
      endsOn: fiscalPeriods.ends_on,
    })
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.tenant_id, tenantId))
    .orderBy(desc(fiscalPeriods.starts_on))
    .limit(PERIOD_LIST_LIMIT)
  return rows
}

export async function findFiscalPeriod(
  tenantId: string,
  periodId: string
): Promise<FiscalPeriodOption | null> {
  const rows = await db
    .select({
      id: fiscalPeriods.id,
      name: fiscalPeriods.name,
      startsOn: fiscalPeriods.starts_on,
      endsOn: fiscalPeriods.ends_on,
    })
    .from(fiscalPeriods)
    .where(
      and(eq(fiscalPeriods.tenant_id, tenantId), eq(fiscalPeriods.id, periodId))
    )
    .limit(1)
  return rows[0] ?? null
}

export async function getTrialBalance(
  tenantId: string,
  range: TrialBalanceRange
): Promise<TrialBalance> {
  const postedInRange: SQL[] = [
    eq(journalLines.tenant_id, tenantId),
    eq(journalEntries.tenant_id, tenantId),
    eq(journalEntries.status, 'posted'),
    lte(journalEntries.posting_date, range.to),
  ]
  if (range.from) postedInRange.push(gte(journalEntries.posting_date, range.from))

  const [accountRows, sumRows] = await Promise.all([
    db
      .select({
        id: ledgerAccounts.id,
        code: ledgerAccounts.code,
        name: ledgerAccounts.name,
        accountType: ledgerAccounts.account_type,
        normalBalance: ledgerAccounts.normal_balance,
        isActive: ledgerAccounts.is_active,
      })
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenant_id, tenantId))
      .orderBy(asc(ledgerAccounts.code)),
    db
      .select({
        accountId: journalLines.ledger_account_id,
        debitCents: sql<string>`coalesce(sum(${journalLines.debit_cents}), 0)`,
        creditCents: sql<string>`coalesce(sum(${journalLines.credit_cents}), 0)`,
      })
      .from(journalLines)
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, journalLines.journal_entry_id),
          eq(journalEntries.tenant_id, tenantId)
        )
      )
      .where(and(...postedInRange))
      .groupBy(journalLines.ledger_account_id),
  ])

  return buildTrialBalance(
    accountRows,
    sumRows.map((row) => ({
      accountId: row.accountId,
      debitCents: toCents(row.debitCents),
      creditCents: toCents(row.creditCents),
    }))
  )
}

export interface LedgerExportFilters {
  accountId?: string
  from?: string
  to?: string
}

export interface LedgerExportRow {
  postingDate: string
  entryNumber: string
  sourceType: string
  accountCode: string
  accountName: string
  projectName: string
  customerName: string
  vendorName: string
  description: string
  debitCents: number
  creditCents: number
}

export async function getLedgerExportRows(
  tenantId: string,
  filters: LedgerExportFilters,
  limit: number
): Promise<LedgerExportRow[]> {
  const conditions: SQL[] = [
    eq(journalLines.tenant_id, tenantId),
    eq(journalEntries.tenant_id, tenantId),
    eq(journalEntries.status, 'posted'),
  ]
  if (filters.accountId) {
    conditions.push(eq(journalLines.ledger_account_id, filters.accountId))
  }
  if (filters.from) conditions.push(gte(journalEntries.posting_date, filters.from))
  if (filters.to) conditions.push(lte(journalEntries.posting_date, filters.to))

  const rows = await db
    .select({
      postingDate: journalEntries.posting_date,
      entryNumber: journalEntries.entry_number,
      sourceType: journalEntries.source_type,
      entryDescription: journalEntries.description,
      accountCode: ledgerAccounts.code,
      accountName: ledgerAccounts.name,
      projectName: projects.name,
      customerName: accounts.name,
      vendorName: vendors.name,
      lineDescription: journalLines.description,
      debitCents: journalLines.debit_cents,
      creditCents: journalLines.credit_cents,
    })
    .from(journalLines)
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journal_entry_id),
        eq(journalEntries.tenant_id, tenantId)
      )
    )
    .innerJoin(
      ledgerAccounts,
      and(
        eq(ledgerAccounts.id, journalLines.ledger_account_id),
        eq(ledgerAccounts.tenant_id, tenantId)
      )
    )
    .leftJoin(
      projects,
      and(
        eq(projects.id, journalLines.project_id),
        eq(projects.tenant_id, tenantId)
      )
    )
    .leftJoin(
      accounts,
      and(
        eq(accounts.id, journalLines.business_account_id),
        eq(accounts.tenant_id, tenantId)
      )
    )
    .leftJoin(
      vendors,
      and(
        eq(vendors.id, journalLines.vendor_id),
        eq(vendors.tenant_id, tenantId)
      )
    )
    .where(and(...conditions))
    .orderBy(
      asc(journalEntries.posting_date),
      asc(journalEntries.entry_number),
      asc(journalLines.line_number)
    )
    .limit(limit)

  return rows.map((row) => ({
    postingDate: row.postingDate,
    entryNumber: row.entryNumber ?? '',
    sourceType: row.sourceType,
    accountCode: row.accountCode,
    accountName: row.accountName,
    projectName: row.projectName ?? '',
    customerName: row.customerName ?? '',
    vendorName: row.vendorName ?? '',
    description: row.lineDescription || row.entryDescription,
    debitCents: row.debitCents,
    creditCents: row.creditCents,
  }))
}

export interface ReceivableAgingRow {
  customerName: string
  projectName: string
  invoiceNumber: string
  issuedDay: string | null
  /** Calendar day the invoice is due; null when no due date was set. */
  dueDay: string | null
  balanceDueCents: number
  retentionOpenCents: number
}

function postedAllocationsForInvoice(
  tenantId: string,
  allocationType: 'customer_current_due' | 'customer_retention'
): SQL<string> {
  return sql<string>`coalesce((
    select sum(allocation.amount_cents)
    from public.cash_allocations allocation
    join public.cash_transactions cash_tx
      on cash_tx.id = allocation.cash_transaction_id
     and cash_tx.tenant_id = ${tenantId}
    where allocation.invoice_id = ${invoices.id}
      and allocation.tenant_id = ${tenantId}
      and allocation.allocation_type = ${allocationType}
      and cash_tx.status = 'posted'
  ), 0)`
}

export async function getReceivableAgingRows(
  tenantId: string,
  limit: number
): Promise<ReceivableAgingRow[]> {
  const rows = await db
    .select({
      invoiceNumber: invoices.invoice_number,
      netAmountCents: invoices.net_amount_cents,
      retentionCents: invoices.retention_cents,
      currentAllocated: postedAllocationsForInvoice(tenantId, 'customer_current_due'),
      retentionAllocated: postedAllocationsForInvoice(tenantId, 'customer_retention'),
      dueDate: invoices.due_date,
      issuedAt: invoices.issued_at,
      projectName: projects.name,
      customerName: accounts.name,
    })
    .from(invoices)
    .innerJoin(
      projects,
      and(
        eq(projects.id, invoices.project_id),
        eq(projects.tenant_id, tenantId)
      )
    )
    .innerJoin(
      accounts,
      and(
        eq(accounts.id, invoices.account_id),
        eq(accounts.tenant_id, tenantId)
      )
    )
    .where(
      and(
        eq(invoices.tenant_id, tenantId),
        isNotNull(invoices.issuance_journal_entry_id),
        inArray(invoices.status, ['issued', 'partial_payment', 'overdue'])
      )
    )
    .orderBy(
      asc(accounts.name),
      asc(invoices.due_date),
      asc(invoices.invoice_number)
    )
    .limit(limit)

  return rows.map((row) => ({
    customerName: row.customerName,
    projectName: row.projectName,
    invoiceNumber: row.invoiceNumber,
    issuedDay: row.issuedAt ? manilaDay(row.issuedAt) : null,
    dueDay: row.dueDate ? utcDay(row.dueDate) : null,
    balanceDueCents: Math.max(
      row.netAmountCents - toCents(row.currentAllocated),
      0
    ),
    retentionOpenCents: Math.max(
      row.retentionCents - toCents(row.retentionAllocated),
      0
    ),
  }))
}

export interface PayableAgingRow {
  vendorName: string
  billNumber: string
  internalNumber: string
  billDay: string
  dueDay: string | null
  totalPayableCents: number
  paidCents: number
  openCents: number
}

export async function getPayableAgingRows(
  tenantId: string,
  limit: number
): Promise<PayableAgingRow[]> {
  const paid = sql<string>`coalesce((
    select sum(allocation.amount_cents)
    from public.cash_allocations allocation
    join public.cash_transactions cash_tx
      on cash_tx.id = allocation.cash_transaction_id
     and cash_tx.tenant_id = ${tenantId}
    where allocation.supplier_bill_id = ${supplierBills.id}
      and allocation.tenant_id = ${tenantId}
      and cash_tx.status = 'posted'
  ), 0)`

  const rows = await db
    .select({
      billNumber: supplierBills.vendor_bill_number,
      internalNumber: supplierBills.internal_number,
      billDate: supplierBills.bill_date,
      dueDate: supplierBills.due_date,
      totalPayableCents: supplierBills.total_payable_cents,
      paidCents: paid,
      vendorName: vendors.name,
    })
    .from(supplierBills)
    .innerJoin(
      vendors,
      and(
        eq(vendors.id, supplierBills.vendor_id),
        eq(vendors.tenant_id, tenantId)
      )
    )
    .where(
      and(
        eq(supplierBills.tenant_id, tenantId),
        eq(supplierBills.status, 'posted'),
        sql`${supplierBills.total_payable_cents} > ${paid}`
      )
    )
    .orderBy(
      asc(vendors.name),
      asc(supplierBills.due_date),
      asc(supplierBills.vendor_bill_number)
    )
    .limit(limit)

  return rows.map((row) => {
    const paidCents = toCents(row.paidCents)
    return {
      vendorName: row.vendorName,
      billNumber: row.billNumber,
      internalNumber: row.internalNumber ?? '',
      billDay: row.billDate,
      dueDay: row.dueDate,
      totalPayableCents: row.totalPayableCents,
      paidCents,
      openCents: Math.max(row.totalPayableCents - paidCents, 0),
    }
  })
}
