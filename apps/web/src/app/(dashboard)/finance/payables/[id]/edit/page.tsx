import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  ledgerAccounts,
  projects,
  purchaseOrders,
  supplierBillLines,
  supplierBills,
  vendors,
} from '@third-code-erp/database/schema'
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { PayableForm } from '../../payable-form'
import { loadPayableEvidence } from '../../payable-evidence'

export const metadata: Metadata = { title: 'Edit supplier bill draft' }

const BILLABLE_STATUSES = [
  'confirmed',
  'issued',
  'partial_delivery',
  'partial_delivered',
  'delivered',
  'fully_delivered',
] as const

export default async function EditSupplierBillPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.post_supplier_bill')
  const { id } = await params

  const [bill] = await db
    .select({
      id: supplierBills.id,
      purchaseOrderId: supplierBills.purchase_order_id,
      vendorBillNumber: supplierBills.vendor_bill_number,
      billDate: supplierBills.bill_date,
      dueDate: supplierBills.due_date,
      inputVatCents: supplierBills.input_vat_cents,
      withholdingTaxCents: supplierBills.withholding_tax_cents,
      notes: supplierBills.notes,
    })
    .from(supplierBills)
    .where(
      and(
        eq(supplierBills.id, id),
        eq(supplierBills.tenant_id, profile.tenantId),
        eq(supplierBills.status, 'draft')
      )
    )
    .limit(1)
  if (!bill) notFound()

  const [billLines, purchaseOrderRows, accounts, evidence] =
    await Promise.all([
    db
      .select({
        id: supplierBillLines.id,
        poLineItemId: supplierBillLines.po_line_item_id,
        stockReceiptLineId: supplierBillLines.stock_receipt_line_id,
        quantityMicros: supplierBillLines.quantity_micros,
        ledgerAccountId: supplierBillLines.ledger_account_id,
        description: supplierBillLines.description,
        amountCents: supplierBillLines.amount_cents,
      })
      .from(supplierBillLines)
      .where(
        and(
          eq(supplierBillLines.supplier_bill_id, bill.id),
          eq(supplierBillLines.tenant_id, profile.tenantId)
        )
      )
      .orderBy(asc(supplierBillLines.line_number)),
    db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.po_number,
        subtotalCents: purchaseOrders.subtotal_cents,
        vendorName: vendors.name,
        projectName: projects.name,
        postedSubtotal: sql<number>`coalesce(sum(
          case when ${supplierBills.status} = 'posted'
            then ${supplierBills.subtotal_cents}
            else 0
          end
        ), 0)`,
      })
      .from(purchaseOrders)
      .innerJoin(
        vendors,
        and(
          eq(vendors.id, purchaseOrders.vendor_id),
          eq(vendors.tenant_id, purchaseOrders.tenant_id)
        )
      )
      .innerJoin(
        projects,
        and(
          eq(projects.id, purchaseOrders.project_id),
          eq(projects.tenant_id, purchaseOrders.tenant_id)
        )
      )
      .leftJoin(
        supplierBills,
        and(
          eq(supplierBills.purchase_order_id, purchaseOrders.id),
          eq(supplierBills.tenant_id, purchaseOrders.tenant_id)
        )
      )
      .where(
        and(
          eq(purchaseOrders.tenant_id, profile.tenantId),
          inArray(purchaseOrders.status, [...BILLABLE_STATUSES])
        )
      )
      .groupBy(
        purchaseOrders.id,
        purchaseOrders.po_number,
        purchaseOrders.subtotal_cents,
        vendors.name,
        projects.name
      )
      .orderBy(asc(purchaseOrders.po_number)),
    db
      .select({
        id: ledgerAccounts.id,
        code: ledgerAccounts.code,
        name: ledgerAccounts.name,
        accountType: ledgerAccounts.account_type,
        systemKey: ledgerAccounts.system_key,
      })
      .from(ledgerAccounts)
      .where(
        and(
          eq(ledgerAccounts.tenant_id, profile.tenantId),
          eq(ledgerAccounts.is_active, true),
          or(
            inArray(ledgerAccounts.account_type, ['asset', 'expense']),
            eq(
              ledgerAccounts.system_key,
              'goods_received_not_invoiced'
            )
          )
        )
      )
      .orderBy(ledgerAccounts.code),
    loadPayableEvidence(profile.tenantId),
  ])

  const options = purchaseOrderRows
    .map((row) => ({
      id: row.id,
      number: row.number,
      vendorName: row.vendorName,
      projectName: row.projectName,
      remainingSubtotalCents:
        row.subtotalCents - Number(row.postedSubtotal ?? 0),
    }))
    .filter(
      (row) =>
        row.id === bill.purchaseOrderId ||
        (row.remainingSubtotalCents > 0 &&
          evidence.some((item) => item.purchaseOrderId === row.id))
    )

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href={`/finance/payables/${bill.id}`}>
          {bill.vendorBillNumber}
        </Link>
        <span>/</span>
        <span>Edit draft</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Draft corrections</p>
          <h1 className="page-title">Edit supplier bill</h1>
          <p className="page-subtitle">
            Update source evidence and allocations before immutable posting.
          </p>
        </div>
      </div>
      <PayableForm
        purchaseOrders={options}
        evidence={evidence}
        grniAccountId={
          accounts.find(
            (account) =>
              account.systemKey === 'goods_received_not_invoiced' &&
              account.accountType === 'liability'
          )?.id ?? null
        }
        accounts={accounts.map((account) => ({
          id: account.id,
          label: `${account.code} · ${account.name}`,
        }))}
        defaultDate={bill.billDate}
        existing={{
          id: bill.id,
          purchaseOrderId: bill.purchaseOrderId,
          vendorBillNumber: bill.vendorBillNumber,
          billDate: bill.billDate,
          dueDate: bill.dueDate ?? '',
          inputVatCents: bill.inputVatCents,
          withholdingTaxCents: bill.withholdingTaxCents,
          notes: bill.notes ?? '',
          lines: billLines.map((line) => ({
            ...line,
            poLineItemId: line.poLineItemId ?? '',
          })),
        }}
      />
    </div>
  )
}
