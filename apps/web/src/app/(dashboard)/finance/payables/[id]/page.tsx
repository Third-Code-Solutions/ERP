import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { alias } from 'drizzle-orm/pg-core'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  journalEntries,
  ledgerAccounts,
  projects,
  purchaseOrders,
  supplierBillLines,
  supplierBills,
  users,
  vendors,
} from '@third-code-erp/database/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import { PayableActions } from './payable-actions'

export const metadata: Metadata = { title: 'Supplier bill' }

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

interface DisbursementAllocationRow extends Record<string, unknown> {
  transaction_id: string
  transaction_number: string
  reference_number: string
  status: 'draft' | 'posted' | 'reversed'
  transaction_date: string
  amount_cents: number
}

interface MatchEvidenceRow extends Record<string, unknown> {
  supplier_bill_line_id: string
  po_line_description: string
  stock_receipt_id: string | null
  receipt_number: string | null
  quantity_micros: number | string | null
  uom_code: string | null
}

function formatQuantity(micros: number): string {
  const whole = Math.floor(micros / 1_000_000)
  const fraction = String(micros % 1_000_000)
    .padStart(6, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

export default async function SupplierBillPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  const canManagePayables = can(profile.role, 'finance.post_supplier_bill')
  const { id } = await params
  const postingJournal = alias(journalEntries, 'posting_journal')
  const reversalJournal = alias(journalEntries, 'reversal_journal')
  const postedUser = alias(users, 'supplier_bill_posted_user')
  const reversedUser = alias(users, 'supplier_bill_reversed_user')

  const [bill] = await db
    .select({
      id: supplierBills.id,
      vendorBillNumber: supplierBills.vendor_bill_number,
      internalNumber: supplierBills.internal_number,
      status: supplierBills.status,
      billDate: supplierBills.bill_date,
      dueDate: supplierBills.due_date,
      currency: supplierBills.currency,
      subtotalCents: supplierBills.subtotal_cents,
      inputVatCents: supplierBills.input_vat_cents,
      withholdingTaxCents: supplierBills.withholding_tax_cents,
      totalPayableCents: supplierBills.total_payable_cents,
      notes: supplierBills.notes,
      purchaseOrderId: supplierBills.purchase_order_id,
      purchaseOrderNumber: purchaseOrders.po_number,
      purchaseOrderSubtotalCents: purchaseOrders.subtotal_cents,
      projectId: supplierBills.project_id,
      projectName: projects.name,
      vendorId: supplierBills.vendor_id,
      vendorName: vendors.name,
      vendorTin: vendors.bir_tin,
      postingJournalId: supplierBills.posting_journal_entry_id,
      postingJournalNumber: postingJournal.entry_number,
      postedAt: supplierBills.posted_at,
      postedByName: postedUser.full_name,
      reversalJournalId: supplierBills.reversal_journal_entry_id,
      reversalJournalNumber: reversalJournal.entry_number,
      reversedAt: supplierBills.reversed_at,
      reversedByName: reversedUser.full_name,
      reversalReason: supplierBills.reversal_reason,
      createdAt: supplierBills.created_at,
    })
    .from(supplierBills)
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
    .innerJoin(
      vendors,
      and(
        eq(vendors.id, supplierBills.vendor_id),
        eq(vendors.tenant_id, supplierBills.tenant_id)
      )
    )
    .leftJoin(
      postingJournal,
      and(
        eq(postingJournal.id, supplierBills.posting_journal_entry_id),
        eq(postingJournal.tenant_id, supplierBills.tenant_id)
      )
    )
    .leftJoin(
      reversalJournal,
      and(
        eq(reversalJournal.id, supplierBills.reversal_journal_entry_id),
        eq(reversalJournal.tenant_id, supplierBills.tenant_id)
      )
    )
    .leftJoin(
      postedUser,
      and(
        eq(postedUser.id, supplierBills.posted_by),
        eq(postedUser.tenant_id, supplierBills.tenant_id)
      )
    )
    .leftJoin(
      reversedUser,
      and(
        eq(reversedUser.id, supplierBills.reversed_by),
        eq(reversedUser.tenant_id, supplierBills.tenant_id)
      )
    )
    .where(
      and(
        eq(supplierBills.id, id),
        eq(supplierBills.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  if (!bill) notFound()

  const lines = await db
    .select({
      id: supplierBillLines.id,
      lineNumber: supplierBillLines.line_number,
      description: supplierBillLines.description,
      amountCents: supplierBillLines.amount_cents,
      ledgerAccountId: supplierBillLines.ledger_account_id,
      ledgerCode: ledgerAccounts.code,
      ledgerName: ledgerAccounts.name,
      ledgerType: ledgerAccounts.account_type,
    })
    .from(supplierBillLines)
    .innerJoin(
      ledgerAccounts,
      and(
        eq(ledgerAccounts.id, supplierBillLines.ledger_account_id),
        eq(ledgerAccounts.tenant_id, supplierBillLines.tenant_id)
      )
    )
    .where(
      and(
        eq(supplierBillLines.supplier_bill_id, bill.id),
        eq(supplierBillLines.tenant_id, profile.tenantId)
      )
    )
    .orderBy(asc(supplierBillLines.line_number))

  const matchEvidence = await db.execute<MatchEvidenceRow>(sql`
    select
      bill_line.id as supplier_bill_line_id,
      po_line.description as po_line_description,
      receipt.id as stock_receipt_id,
      coalesce(receipt.internal_number, receipt.supplier_delivery_reference)
        as receipt_number,
      bill_line.quantity_micros,
      uom.code as uom_code
    from public.supplier_bill_lines bill_line
    join public.po_line_items po_line
      on po_line.id = bill_line.po_line_item_id
     and po_line.tenant_id = bill_line.tenant_id
    left join public.stock_receipt_lines receipt_line
      on receipt_line.id = bill_line.stock_receipt_line_id
     and receipt_line.tenant_id = bill_line.tenant_id
    left join public.stock_receipts receipt
      on receipt.id = receipt_line.stock_receipt_id
     and receipt.tenant_id = receipt_line.tenant_id
    left join public.units_of_measure uom
      on uom.id = receipt_line.uom_id
     and uom.tenant_id = receipt_line.tenant_id
    where bill_line.supplier_bill_id = ${bill.id}::uuid
      and bill_line.tenant_id = ${profile.tenantId}::uuid
    order by bill_line.line_number
  `)
  const matchByLineId = new Map(
    matchEvidence.map((evidence) => [
      evidence.supplier_bill_line_id,
      evidence,
    ])
  )

  const allocationTotal = lines.reduce(
    (total, line) => total + line.amountCents,
    0
  )
  const disbursements = await db.execute<DisbursementAllocationRow>(sql`
    select
      cash_tx.id as transaction_id,
      coalesce(cash_tx.internal_number, cash_tx.reference_number)
        as transaction_number,
      cash_tx.reference_number,
      cash_tx.status,
      cash_tx.transaction_date,
      allocation.amount_cents
    from public.cash_allocations allocation
    join public.cash_transactions cash_tx
      on cash_tx.id = allocation.cash_transaction_id
     and cash_tx.tenant_id = allocation.tenant_id
    where allocation.supplier_bill_id = ${bill.id}::uuid
      and allocation.tenant_id = ${profile.tenantId}::uuid
    order by cash_tx.transaction_date desc, allocation.line_number
  `)
  const activeDisbursed = disbursements
    .filter((allocation) => allocation.status === 'posted')
    .reduce(
      (sum, allocation) => sum + Number(allocation.amount_cents),
      0
    )

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/finance/payables">Payables</Link>
        <span>/</span>
        <span>{bill.internalNumber ?? bill.vendorBillNumber}</span>
      </div>

      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Supplier bill · {bill.vendorName}</p>
          <h1 className="page-title">
            {bill.internalNumber ?? bill.vendorBillNumber}
          </h1>
          <p className="page-subtitle">
            Vendor reference {bill.vendorBillNumber} · {bill.projectName}
          </p>
        </div>
        <span className={`finance-status finance-status-${bill.status}`}>
          {bill.status}
        </span>
      </div>

      <div className="journal-facts payable-facts">
        <div>
          <span>Amount payable</span>
          <strong>{formatPHP(bill.totalPayableCents)}</strong>
        </div>
        <div>
          <span>Bill date</span>
          <strong>{bill.billDate}</strong>
        </div>
        <div>
          <span>Due date</span>
          <strong>{bill.dueDate ?? 'Not specified'}</strong>
        </div>
        <div>
          <span>Purchase Order</span>
          <strong>
            <Link href={`/purchase-orders/${bill.purchaseOrderId}`}>
              {bill.purchaseOrderNumber}
            </Link>
          </strong>
        </div>
      </div>

      <div className="finance-two-column">
        <section className="finance-section">
          <div className="finance-section-heading">
            <div>
              <p className="finance-eyebrow">Commitment control</p>
              <h2>Match evidence</h2>
            </div>
          </div>
          <dl className="payable-evidence-list">
            <div>
              <dt>Vendor</dt>
              <dd>
                {bill.vendorName}
                {bill.vendorTin ? ` · TIN ${bill.vendorTin}` : ''}
              </dd>
            </div>
            <div>
              <dt>Project</dt>
              <dd>
                <Link href={`/projects/${bill.projectId}`}>
                  {bill.projectName}
                </Link>
              </dd>
            </div>
            <div>
              <dt>PO subtotal</dt>
              <dd>{formatPHP(bill.purchaseOrderSubtotalCents)}</dd>
            </div>
            <div>
              <dt>Bill allocation</dt>
              <dd>{formatPHP(allocationTotal)}</dd>
            </div>
          </dl>
          <p className="finance-control-note">
            Posting locks and rechecks Purchase Order lines, active Stock
            Receipt evidence, unmatched quantities and values, Vendor, project,
            account controls, and fiscal period in one transaction.
          </p>
        </section>

        <section className="finance-section">
          <div className="finance-section-heading">
            <div>
              <p className="finance-eyebrow">Lifecycle evidence</p>
              <h2>Posting control</h2>
            </div>
          </div>
          {canManagePayables && (
            <PayableActions
              billId={bill.id}
              status={bill.status}
              defaultDate={new Date().toISOString().slice(0, 10)}
            />
          )}
          {bill.postingJournalId && (
            <p className="finance-control-note">
              Posted by {bill.postedByName ?? 'Finance'}{' '}
              {bill.postedAt
                ? `on ${new Date(bill.postedAt).toLocaleString('en-PH')}`
                : ''}
              .{' '}
              <Link href={`/finance/journals/${bill.postingJournalId}`}>
                Open journal {bill.postingJournalNumber}
              </Link>
            </p>
          )}
          {bill.reversalJournalId && (
            <p className="finance-control-note">
              Reversed by {bill.reversedByName ?? 'Finance'}{' '}
              {bill.reversedAt
                ? `on ${new Date(bill.reversedAt).toLocaleString('en-PH')}`
                : ''}
              . Reason: {bill.reversalReason}.{' '}
              <Link href={`/finance/journals/${bill.reversalJournalId}`}>
                Open reversal {bill.reversalJournalNumber}
              </Link>
            </p>
          )}
        </section>
      </div>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Cost destination</p>
            <h2>Allocations</h2>
          </div>
          <p>These become debit lines when Finance posts the supplier bill.</p>
        </div>
        <div className="finance-table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ledger account</th>
                <th>Match evidence</th>
                <th>Quantity</th>
                <th>Description</th>
                <th>Type</th>
                <th className="numeric">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  {(() => {
                    const evidence = matchByLineId.get(line.id)
                    return (
                      <>
                  <td>{line.lineNumber}</td>
                  <td>
                    <code>{line.ledgerCode}</code> · {line.ledgerName}
                  </td>
                  <td>
                    {evidence?.stock_receipt_id ? (
                      <Link
                        href={`/inventory/receipts/${evidence.stock_receipt_id}`}
                      >
                        {evidence.receipt_number ?? 'Stock Receipt'}
                      </Link>
                    ) : (
                      evidence?.po_line_description ?? 'PO line'
                    )}
                  </td>
                  <td>
                    {evidence?.quantity_micros == null
                      ? '—'
                      : `${formatQuantity(
                          Number(evidence.quantity_micros)
                        )} ${evidence.uom_code ?? ''}`}
                  </td>
                  <td>{line.description}</td>
                  <td>{line.ledgerType}</td>
                  <td className="numeric">{formatPHP(line.amountCents)}</td>
                      </>
                    )
                  })()}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={6}>Allocated subtotal</th>
                <th className="numeric">{formatPHP(allocationTotal)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="payable-tax-summary">
          <span>Subtotal {formatPHP(bill.subtotalCents)}</span>
          <span>Input VAT +{formatPHP(bill.inputVatCents)}</span>
          <span>
            Withholding −{formatPHP(bill.withholdingTaxCents)}
          </span>
          <strong>Payable {formatPHP(bill.totalPayableCents)}</strong>
        </div>
        {bill.notes && (
          <div className="payable-note">
            <span>Internal note</span>
            <p>{bill.notes}</p>
          </div>
        )}
      </section>

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <p className="finance-eyebrow">Settlement evidence</p>
            <h2>Disbursement allocations</h2>
          </div>
          <p>
            Open payable{' '}
            {formatPHP(
              Math.max(bill.totalPayableCents - activeDisbursed, 0)
            )}
          </p>
        </div>
        <div className="finance-table-shell">
          {disbursements.length === 0 ? (
            <div className="card-empty">
              <p>No disbursement has been allocated to this Supplier Bill.</p>
              {canManagePayables && <Link href="/finance/cash/new">Record disbursement</Link>}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Disbursement</th>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="numeric">Amount</th>
                </tr>
              </thead>
              <tbody>
                {disbursements.map((allocation, index) => (
                  <tr key={`${allocation.transaction_id}:${index}`}>
                    <td>
                      <Link href={`/finance/cash/${allocation.transaction_id}`}>
                        {allocation.transaction_number}
                      </Link>
                    </td>
                    <td>{allocation.transaction_date}</td>
                    <td>{allocation.reference_number}</td>
                    <td>
                      <span
                        className={`finance-status finance-status-${allocation.status}`}
                      >
                        {allocation.status}
                      </span>
                    </td>
                    <td className="numeric">
                      {formatPHP(Number(allocation.amount_cents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
