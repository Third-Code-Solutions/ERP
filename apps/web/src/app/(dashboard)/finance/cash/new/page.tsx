import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  cashAccounts,
  ledgerAccounts,
} from '@third-code-erp/database/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import { CashForm, type CashTargetOption } from '../cash-form'

export const metadata: Metadata = { title: 'New cash transaction' }

interface ReceiptTargetRow {
  [key: string]: unknown
  invoice_id: string
  invoice_number: string
  account_id: string
  account_name: string
  current_remaining_cents: number
  retention_remaining_cents: number
}

interface DisbursementTargetRow {
  [key: string]: unknown
  supplier_bill_id: string
  bill_number: string
  vendor_id: string
  vendor_name: string
  remaining_cents: number
}

export default async function NewCashTransactionPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.manage_cash')

  const [accountRows, receiptRows, disbursementRows] = await Promise.all([
    db
      .select({
        id: cashAccounts.id,
        name: cashAccounts.name,
        kind: cashAccounts.account_kind,
        code: ledgerAccounts.code,
        currency: cashAccounts.currency,
      })
      .from(cashAccounts)
      .innerJoin(
        ledgerAccounts,
        and(
          eq(ledgerAccounts.id, cashAccounts.ledger_account_id),
          eq(ledgerAccounts.tenant_id, cashAccounts.tenant_id)
        )
      )
      .where(
        and(
          eq(cashAccounts.tenant_id, profile.tenantId),
          eq(cashAccounts.is_active, true),
          eq(ledgerAccounts.is_active, true)
        )
      )
      .orderBy(asc(cashAccounts.name)),
    db.execute<ReceiptTargetRow>(sql`
      select
        invoice.id as invoice_id,
        invoice.invoice_number,
        business_account.id as account_id,
        business_account.name as account_name,
        greatest(
          invoice.net_amount_cents
            - coalesce(sum(allocation.amount_cents) filter (
                where allocation.allocation_type = 'customer_current_due'
                  and cash_tx.status = 'posted'
              ), 0),
          0
        )::bigint as current_remaining_cents,
        greatest(
          invoice.retention_cents
            - coalesce(sum(allocation.amount_cents) filter (
                where allocation.allocation_type = 'customer_retention'
                  and cash_tx.status = 'posted'
              ), 0),
          0
        )::bigint as retention_remaining_cents
      from public.invoices invoice
      join public.accounts business_account
        on business_account.id = invoice.account_id
       and business_account.tenant_id = invoice.tenant_id
      left join public.cash_allocations allocation
        on allocation.invoice_id = invoice.id
       and allocation.tenant_id = invoice.tenant_id
      left join public.cash_transactions cash_tx
        on cash_tx.id = allocation.cash_transaction_id
       and cash_tx.tenant_id = allocation.tenant_id
      where invoice.tenant_id = ${profile.tenantId}::uuid
        and invoice.status in ('issued', 'overdue', 'partial_payment')
        and invoice.reversal_journal_entry_id is null
      group by
        invoice.id,
        invoice.invoice_number,
        invoice.net_amount_cents,
        invoice.retention_cents,
        business_account.id,
        business_account.name
      order by business_account.name, invoice.invoice_number
    `),
    db.execute<DisbursementTargetRow>(sql`
      select
        bill.id as supplier_bill_id,
        coalesce(bill.internal_number, bill.vendor_bill_number)
          as bill_number,
        vendor.id as vendor_id,
        vendor.name as vendor_name,
        greatest(
          bill.total_payable_cents
            - coalesce(sum(allocation.amount_cents) filter (
                where cash_tx.status = 'posted'
              ), 0),
          0
        )::bigint as remaining_cents
      from public.supplier_bills bill
      join public.vendors vendor
        on vendor.id = bill.vendor_id
       and vendor.tenant_id = bill.tenant_id
      left join public.cash_allocations allocation
        on allocation.supplier_bill_id = bill.id
       and allocation.tenant_id = bill.tenant_id
      left join public.cash_transactions cash_tx
        on cash_tx.id = allocation.cash_transaction_id
       and cash_tx.tenant_id = allocation.tenant_id
      where bill.tenant_id = ${profile.tenantId}::uuid
        and bill.status = 'posted'
      group by
        bill.id,
        bill.internal_number,
        bill.vendor_bill_number,
        bill.total_payable_cents,
        vendor.id,
        vendor.name
      order by vendor.name, bill_number
    `),
  ])

  const receiptTargets: CashTargetOption[] = receiptRows.flatMap((row) => {
    const targets: CashTargetOption[] = []
    const currentRemaining = Number(row.current_remaining_cents)
    const retentionRemaining = Number(row.retention_remaining_cents)
    if (currentRemaining > 0) {
      targets.push({
        key: `${row.invoice_id}:customer_current_due`,
        targetId: row.invoice_id,
        counterpartyId: row.account_id,
        counterpartyName: row.account_name,
        allocationType: 'customer_current_due',
        label: `${row.invoice_number} · Current due`,
        remainingCents: currentRemaining,
      })
    }
    if (retentionRemaining > 0) {
      targets.push({
        key: `${row.invoice_id}:customer_retention`,
        targetId: row.invoice_id,
        counterpartyId: row.account_id,
        counterpartyName: row.account_name,
        allocationType: 'customer_retention',
        label: `${row.invoice_number} · Retention`,
        remainingCents: retentionRemaining,
      })
    }
    return targets
  })
  const disbursementTargets: CashTargetOption[] = disbursementRows
    .map((row) => ({
      key: `${row.supplier_bill_id}:supplier_bill`,
      targetId: row.supplier_bill_id,
      counterpartyId: row.vendor_id,
      counterpartyName: row.vendor_name,
      allocationType: 'supplier_bill' as const,
      label: row.bill_number,
      remainingCents: Number(row.remaining_cents),
    }))
    .filter((target) => target.remainingCents > 0)

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/finance/cash">Cash</Link>
        <span>/</span>
        <span>New transaction</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Controlled settlement evidence</p>
          <h1 className="page-title">New cash transaction</h1>
          <p className="page-subtitle">
            Allocate every peso to a live customer or Vendor balance before
            posting.
          </p>
        </div>
      </div>
      {accountRows.length === 0 ? (
        <section className="finance-section">
          <div className="card-empty">
            <p>Set up an active Cash Account before recording cash.</p>
            <Link href="/finance">Open Finance controls</Link>
          </div>
        </section>
      ) : receiptTargets.length === 0 && disbursementTargets.length === 0 ? (
        <section className="finance-section">
          <div className="card-empty">
            <p>No issued invoice or posted Supplier Bill has an open balance.</p>
            <Link href="/finance/cash">Review cash history</Link>
          </div>
        </section>
      ) : (
        <CashForm
          cashAccounts={accountRows.map((account) => ({
            id: account.id,
            label: `${account.name} · ${account.code} · ${account.currency}`,
          }))}
          receiptTargets={receiptTargets}
          disbursementTargets={disbursementTargets}
          defaultDate={new Date().toISOString().slice(0, 10)}
        />
      )}
    </div>
  )
}
