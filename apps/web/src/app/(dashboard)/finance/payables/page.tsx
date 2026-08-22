import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  projects,
  purchaseOrders,
  supplierBills,
  vendors,
} from '@third-code-erp/database/schema'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import {
  financePayablesReadsUseCoreApi,
  getFinancePayablesThroughCoreApi,
} from '@/lib/erp-core-client'

export const metadata: Metadata = { title: 'Supplier payables' }

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function ageInDays(dueDate: string | null, today: string): number {
  if (!dueDate) return 0
  return Math.floor(
    (Date.parse(`${today}T00:00:00Z`) -
      Date.parse(`${dueDate}T00:00:00Z`)) /
      86_400_000
  )
}

function agingBucket(daysPastDue: number): string {
  if (daysPastDue <= 0) return 'Current'
  if (daysPastDue <= 30) return '1–30'
  if (daysPastDue <= 60) return '31–60'
  if (daysPastDue <= 90) return '61–90'
  return '90+'
}

type PayableRow = {
  id: string
  vendorBillNumber: string
  internalNumber: string | null
  status: 'draft' | 'posted' | 'reversed'
  billDate: string
  dueDate: string | null
  subtotalCents: number
  inputVatCents: number
  withholdingTaxCents: number
  totalPayableCents: number
  paidCents: number
  vendorId: string
  vendorName: string
  purchaseOrderId: string
  purchaseOrderNumber: string
  projectId: string
  projectName: string
}

export default async function PayablesPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  const canManagePayables = can(profile.role, 'finance.post_supplier_bill')

  let rows: PayableRow[]
  if (financePayablesReadsUseCoreApi(profile.tenantId)) {
    const result = await getFinancePayablesThroughCoreApi({
      vendorId: undefined,
      projectId: undefined,
      status: undefined,
      dueFrom: undefined,
      dueTo: undefined,
      page: 1,
      limit: 500,
    })
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'Supplier payables were not read.')
    }
    if (result.data.total > result.data.rows.length) {
      throw new Error('Supplier payables exceed the closed projection page limit.')
    }
    rows = result.data.rows.map((bill) => ({
      id: bill.id,
      vendorBillNumber: bill.vendorBillNumber,
      internalNumber: bill.internalNumber,
      status: bill.status,
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      subtotalCents: bill.subtotalCents,
      inputVatCents: bill.inputVatCents,
      withholdingTaxCents: bill.withholdingTaxCents,
      totalPayableCents: bill.totalPayableCents,
      paidCents: bill.paidCents,
      vendorId: bill.vendorId,
      vendorName: bill.vendorName,
      purchaseOrderId: bill.purchaseOrderId,
      purchaseOrderNumber: bill.purchaseOrderNumber,
      projectId: bill.projectId,
      projectName: bill.projectName,
    }))
  } else {
    const directRows = await db
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
        paidCents: sql<number>`coalesce((
          select sum(allocation.amount_cents)
          from public.cash_allocations allocation
          join public.cash_transactions cash_tx
            on cash_tx.id = allocation.cash_transaction_id
           and cash_tx.tenant_id = allocation.tenant_id
          where allocation.supplier_bill_id = ${supplierBills.id}
            and allocation.tenant_id = ${supplierBills.tenant_id}
            and cash_tx.status = 'posted'
        ), 0)`,
        vendorId: supplierBills.vendor_id,
        vendorName: vendors.name,
        purchaseOrderId: supplierBills.purchase_order_id,
        purchaseOrderNumber: purchaseOrders.po_number,
        projectId: supplierBills.project_id,
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
      .where(eq(supplierBills.tenant_id, profile.tenantId))
      .orderBy(desc(supplierBills.bill_date), asc(vendors.name))

    rows = directRows.map((row) => ({
      id: row.id,
      vendorBillNumber: row.vendorBillNumber,
      internalNumber: row.internalNumber,
      status: row.status,
      billDate: row.billDate,
      dueDate: row.dueDate,
      subtotalCents: row.subtotalCents,
      inputVatCents: row.inputVatCents,
      withholdingTaxCents: row.withholdingTaxCents,
      totalPayableCents: row.totalPayableCents,
      paidCents: Number(row.paidCents ?? 0),
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      purchaseOrderId: row.purchaseOrderId,
      purchaseOrderNumber: row.purchaseOrderNumber,
      projectId: row.projectId,
      projectName: row.projectName,
    }))
  }

  const today = new Date().toISOString().slice(0, 10)
  const rowsWithBalance = rows.map((row) => ({
    ...row,
    openCents:
      row.status === 'posted'
        ? Math.max(row.totalPayableCents - Number(row.paidCents ?? 0), 0)
        : 0,
  }))
  const openRows = rowsWithBalance.filter((row) => row.openCents > 0)
  const draftRows = rows.filter((row) => row.status === 'draft')
  const totalOpen = openRows.reduce(
    (total, row) => total + row.openCents,
    0
  )
  const overdueOpen = openRows.filter(
    (row) => ageInDays(row.dueDate, today) > 0
  )
  const aging = ['Current', '1–30', '31–60', '61–90', '90+'].map(
    (bucket) => ({
      bucket,
      amount: openRows
        .filter(
          (row) => agingBucket(ageInDays(row.dueDate, today)) === bucket
        )
        .reduce((total, row) => total + row.openCents, 0),
    })
  )

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Finance · Vendor subledger</p>
          <h1 className="page-title">Payables</h1>
          <p className="page-subtitle">
            Match supplier bills to issued Purchase Orders before a liability
            reaches the ledger. Receipt-level matching arrives with the
            inventory slice.
          </p>
        </div>
        <div className="finance-header-actions">
          <Link href="/finance" className="finance-secondary-link">
            Finance controls
          </Link>
          {canManagePayables && (
            <Link href="/finance/payables/new" className="finance-primary-link">
              New supplier bill
            </Link>
          )}
        </div>
      </div>

      <div className="kpi-grid finance-kpis">
        <div className="kpi-card">
          <p className="kpi-card-label">Open payable</p>
          <p className="kpi-card-value finance-money-kpi">
            {formatPHP(totalOpen)}
          </p>
          <p className="kpi-card-sub">{openRows.length} posted supplier bills</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Past due</p>
          <p className="kpi-card-value">{overdueOpen.length}</p>
          <p className="kpi-card-sub">
            {formatPHP(
              overdueOpen.reduce(
                (total, row) => total + row.openCents,
                0
              )
            )}
          </p>
        </div>
        <div className="kpi-card">
          <p className="kpi-card-label">Draft review</p>
          <p className="kpi-card-value">{draftRows.length}</p>
          <p className="kpi-card-sub">Not yet recognized as liabilities</p>
        </div>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Due-date exposure</p>
            <h2>Open-payable aging</h2>
          </div>
          <p>
            Posted disbursement allocations reduce each Supplier Bill’s live
            open balance.
          </p>
        </div>
        <div className="finance-aging-grid">
          {aging.map((bucket) => (
            <div className="finance-aging-card" key={bucket.bucket}>
              <span>{bucket.bucket}</span>
              <strong>{formatPHP(bucket.amount)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Matched documents</p>
            <h2>Supplier bills</h2>
          </div>
          <p>Vendor number uniqueness is enforced within each Vendor.</p>
        </div>
        <div className="finance-table-shell">
          {rows.length === 0 ? (
            <div className="card-empty">
              <p>No supplier bills yet.</p>
              {canManagePayables && (
                <Link href="/finance/payables/new">
                  Match the first supplier bill
                </Link>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Vendor</th>
                  <th>Purchase Order</th>
                  <th>Project</th>
                  <th>Due</th>
                  <th>Aging</th>
                  <th>Status</th>
                  <th className="numeric">Open payable</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithBalance.map((row) => {
                  const age = ageInDays(row.dueDate, today)
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link
                          className="finance-entry-link"
                          href={`/finance/payables/${row.id}`}
                        >
                          {row.internalNumber ?? row.vendorBillNumber}
                        </Link>
                        {row.internalNumber && (
                          <span className="finance-cell-detail">
                            Vendor ref {row.vendorBillNumber}
                          </span>
                        )}
                      </td>
                      <td>{row.vendorName}</td>
                      <td>
                        <Link href={`/purchase-orders/${row.purchaseOrderId}`}>
                          {row.purchaseOrderNumber}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/projects/${row.projectId}`}>
                          {row.projectName}
                        </Link>
                      </td>
                      <td>{row.dueDate ?? 'No due date'}</td>
                      <td>
                        {row.status === 'posted'
                          ? agingBucket(age)
                          : 'Not open'}
                      </td>
                      <td>
                        <span
                          className={`finance-status finance-status-${row.status}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="numeric">
                        {formatPHP(
                          row.status === 'draft'
                            ? row.totalPayableCents
                            : row.openCents
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
