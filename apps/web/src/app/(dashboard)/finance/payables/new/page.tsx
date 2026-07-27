import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  ledgerAccounts,
  projects,
  purchaseOrders,
  supplierBills,
  vendors,
} from '@third-code-erp/database/schema'
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { PayableForm } from '../payable-form'
import { loadPayableEvidence } from '../payable-evidence'

export const metadata: Metadata = { title: 'New supplier bill' }

const BILLABLE_STATUSES = [
  'confirmed',
  'issued',
  'partial_delivery',
  'partial_delivered',
  'delivered',
  'fully_delivered',
] as const

export default async function NewSupplierBillPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.post_supplier_bill')
  const query = await searchParams

  const [purchaseOrderRows, accounts, evidence] = await Promise.all([
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
        row.remainingSubtotalCents > 0 &&
        evidence.some((item) => item.purchaseOrderId === row.id)
    )
  const defaultPurchaseOrderId = options.some((row) => row.id === query.po)
    ? query.po
    : undefined

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/finance/payables">Payables</Link>
        <span>/</span>
        <span>New supplier bill</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Controlled payable intake</p>
          <h1 className="page-title">New supplier bill</h1>
          <p className="page-subtitle">
            One clean review path from approved commitment to classified
            liability.
          </p>
        </div>
      </div>
      {options.length === 0 ? (
        <section className="finance-section">
          <div className="card-empty">
            <p>
              No issued Purchase Order has eligible unbilled line evidence.
              Inventory lines need a posted Stock Receipt first.
            </p>
            <Link href="/inventory/receipts">Review Stock Receipts</Link>
          </div>
        </section>
      ) : accounts.length === 0 ? (
        <section className="finance-section">
          <div className="card-empty">
            <p>Create an active asset or expense ledger account first.</p>
            <Link href="/finance">Open Finance controls</Link>
          </div>
        </section>
      ) : (
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
          defaultDate={new Date().toISOString().slice(0, 10)}
          defaultPurchaseOrderId={defaultPurchaseOrderId}
        />
      )}
    </div>
  )
}
