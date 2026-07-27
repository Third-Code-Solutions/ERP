import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { alias } from 'drizzle-orm/pg-core'
import { can, getUser, getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  costCodes,
  poLineItems,
  projectBudgets,
  projects,
  purchaseOrders,
  supplierBills,
  users,
  vendors,
} from '@third-code-erp/database/schema'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { PoStatusActions } from './po-status-actions'
import { ApprovalTimeline } from '@/components/procurement/approval-timeline'
import { ReceiveLineForm } from '@/components/procurement/receive-line-form'
import { CostCodeAssignment } from '@/components/procurement/cost-code-assignment'

export const metadata: Metadata = { title: 'Purchase Order' }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  partial_delivery: 'Partial Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  // Three-step approval flow
  pending_pm_approval: 'Pending PM Approval',
  pending_commercial_approval: 'Pending Commercial Approval',
  pending_scm_issuance: 'Pending SCM Issuance',
  issued: 'Issued',
  partial_delivered: 'Partial Delivered',
  fully_delivered: 'Fully Delivered',
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  submitted: '#3b82f6',
  confirmed: '#8b5cf6',
  partial_delivery: '#f59e0b',
  delivered: '#10b981',
  cancelled: '#ef4444',
  pending_pm_approval: '#f59e0b',
  pending_commercial_approval: '#f59e0b',
  pending_scm_issuance: '#E07B2A',
  issued: '#3b82f6',
  partial_delivered: '#f59e0b',
  fully_delivered: '#10b981',
}

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface PoBudgetControlRow extends Record<string, unknown> {
  cost_code_id: string
  code: string
  name: string
  baseline_cents: number
  current_po_cents: number
  other_committed_cents: number
}

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  // Profile gives us the role for client-side button gating. We still rely on
  // server actions to do the authoritative permission check.
  const profile = await getUserProfile()
  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

  // Self-joins on users for approver/issuer names. Each step gets its own alias.
  const pmUser = alias(users, 'pm_user')
  const commercialUser = alias(users, 'commercial_user')
  const scmUser = alias(users, 'scm_user')

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      po_number: purchaseOrders.po_number,
      status: purchaseOrders.status,
      subtotal_cents: purchaseOrders.subtotal_cents,
      vat_cents: purchaseOrders.vat_cents,
      withholding_tax_cents: purchaseOrders.withholding_tax_cents,
      total_cents: purchaseOrders.total_cents,
      delivery_date: purchaseOrders.delivery_date,
      notes: purchaseOrders.notes,
      created_at: purchaseOrders.created_at,
      project_name: projects.name,
      project_id: purchaseOrders.project_id,
      vendor_name: vendors.name,
      vendor_id: purchaseOrders.vendor_id,
      vendor_contact: vendors.contact_name,
      vendor_email: vendors.email,
      vendor_phone: vendors.phone,
      vendor_tin: vendors.bir_tin,
      pm_approved_at: purchaseOrders.pm_approved_at,
      commercial_approved_at: purchaseOrders.commercial_approved_at,
      scm_issued_at: purchaseOrders.scm_issued_at,
      supplier_email_sent_at: purchaseOrders.supplier_email_sent_at,
      pm_approver_name: pmUser.full_name,
      commercial_approver_name: commercialUser.full_name,
      scm_issuer_name: scmUser.full_name,
    })
    .from(purchaseOrders)
    .leftJoin(projects, eq(purchaseOrders.project_id, projects.id))
    .leftJoin(vendors, eq(purchaseOrders.vendor_id, vendors.id))
    .leftJoin(pmUser, eq(purchaseOrders.pm_approved_by, pmUser.id))
    .leftJoin(commercialUser, eq(purchaseOrders.commercial_approved_by, commercialUser.id))
    .leftJoin(scmUser, eq(purchaseOrders.scm_issued_by, scmUser.id))
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenant_id, userRow.tenant_id)))

  if (!po) return notFound()

  const [lines, costCodeRows] = await Promise.all([
    db
    .select()
    .from(poLineItems)
    .where(and(eq(poLineItems.po_id, id), eq(poLineItems.tenant_id, userRow.tenant_id)))
    .orderBy(asc(poLineItems.sort_order)),
    db
      .select({
        id: costCodes.id,
        code: costCodes.code,
        name: costCodes.name,
      })
      .from(costCodes)
      .where(
        and(
          eq(costCodes.tenant_id, userRow.tenant_id),
          eq(costCodes.is_active, true)
        )
      )
      .orderBy(costCodes.code),
  ])

  const canManagePayables = profile
    ? can(profile.role, 'finance.post_supplier_bill')
    : false
  const payableRows = canManagePayables
    ? await db
        .select({
          id: supplierBills.id,
          vendorBillNumber: supplierBills.vendor_bill_number,
          internalNumber: supplierBills.internal_number,
          status: supplierBills.status,
          billDate: supplierBills.bill_date,
          totalPayableCents: supplierBills.total_payable_cents,
        })
        .from(supplierBills)
        .where(
          and(
            eq(supplierBills.purchase_order_id, po.id),
            eq(supplierBills.tenant_id, userRow.tenant_id)
          )
        )
        .orderBy(desc(supplierBills.bill_date))
    : []
  const [approvedBudget] = po.project_id
    ? await db
        .select({
          id: projectBudgets.id,
          controlMode: projectBudgets.control_mode,
          toleranceBps: projectBudgets.commitment_tolerance_bps,
          currency: projectBudgets.currency,
          revision: projectBudgets.revision,
        })
        .from(projectBudgets)
        .where(
          and(
            eq(projectBudgets.tenant_id, userRow.tenant_id),
            eq(projectBudgets.project_id, po.project_id),
            eq(projectBudgets.status, 'approved')
          )
        )
        .limit(1)
    : []
  const rawBudgetControlRows =
    approvedBudget && po.project_id
      ? await db.execute<PoBudgetControlRow>(sql`
          with current_po as (
            select
              line.cost_code_id,
              sum(line.line_total_cents)::bigint as amount_cents
            from public.po_line_items line
            where line.tenant_id = ${userRow.tenant_id}::uuid
              and line.po_id = ${po.id}::uuid
            group by line.cost_code_id
          ),
          other_commitment as (
            select
              line.cost_code_id,
              sum(line.line_total_cents)::bigint as amount_cents
            from public.po_line_items line
            join public.purchase_orders purchase_order
              on purchase_order.id = line.po_id
             and purchase_order.tenant_id = line.tenant_id
            where line.tenant_id = ${userRow.tenant_id}::uuid
              and purchase_order.project_id = ${po.project_id}::uuid
              and purchase_order.id <> ${po.id}::uuid
              and purchase_order.status::text in (
                'confirmed',
                'issued',
                'partial_delivery',
                'partial_delivered',
                'delivered',
                'fully_delivered'
              )
            group by line.cost_code_id
          )
          select
            budget_line.cost_code_id,
            cost_code.code,
            cost_code.name,
            budget_line.amount_cents::bigint as baseline_cents,
            coalesce(current_po.amount_cents, 0)::bigint as current_po_cents,
            coalesce(other_commitment.amount_cents, 0)::bigint
              as other_committed_cents
          from public.project_budget_lines budget_line
          join public.cost_codes cost_code
            on cost_code.id = budget_line.cost_code_id
           and cost_code.tenant_id = budget_line.tenant_id
          left join current_po
            on current_po.cost_code_id = budget_line.cost_code_id
          left join other_commitment
            on other_commitment.cost_code_id = budget_line.cost_code_id
          where budget_line.tenant_id = ${userRow.tenant_id}::uuid
            and budget_line.project_budget_id = ${approvedBudget.id}::uuid
            and (
              coalesce(current_po.amount_cents, 0) <> 0
              or coalesce(other_commitment.amount_cents, 0) <> 0
            )
          order by cost_code.code
        `)
      : []
  const budgetControlRows = rawBudgetControlRows.map((row) => ({
    ...row,
    baseline_cents: Number(row.baseline_cents),
    current_po_cents: Number(row.current_po_cents),
    other_committed_cents: Number(row.other_committed_cents),
  }))
  const canStartSupplierBill =
    canManagePayables &&
    !!po.vendor_id &&
    [
      'confirmed',
      'issued',
      'partial_delivery',
      'partial_delivered',
      'delivered',
      'fully_delivered',
    ].includes(po.status)

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Link href="/purchase-orders" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          Purchase Orders
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>{po.po_number}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '16px 0 24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px', color: 'var(--color-neutral-900)', fontFamily: 'JetBrains Mono, monospace' }}>
            {po.po_number}
          </h1>
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
            {po.project_id && (
              <Link href={`/projects/${po.project_id}`} style={{ color: 'var(--color-navy-700)', textDecoration: 'none' }}>
                {po.project_name}
              </Link>
            )}
            <span>Created {new Date(po.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: STATUS_COLORS[po.status] ?? '#9ca3af',
              background: `${STATUS_COLORS[po.status] ?? '#9ca3af'}18`,
              border: `1px solid ${STATUS_COLORS[po.status] ?? '#9ca3af'}40`,
            }}
          >
            {STATUS_LABELS[po.status] ?? po.status}
          </span>
          <PoStatusActions poId={id} currentStatus={po.status} viewerRole={profile?.role ?? null} />
          <Link
            href={`/purchase-orders/${id}/print`}
            target="_blank"
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              fontWeight: 500,
              border: '1px solid var(--color-border)',
              background: 'white',
              color: 'var(--color-neutral-700)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Print / PDF
          </Link>
        </div>
      </div>

      {/* Three-step approval timeline */}
      <div style={{ marginBottom: '16px' }}>
        <ApprovalTimeline
          status={po.status}
          pmApprovedAt={po.pm_approved_at}
          pmApproverName={po.pm_approver_name}
          commercialApprovedAt={po.commercial_approved_at}
          commercialApproverName={po.commercial_approver_name}
          scmIssuedAt={po.scm_issued_at}
          scmIssuerName={po.scm_issuer_name}
          supplierEmailSentAt={po.supplier_email_sent_at}
        />
      </div>

      {/* Two-column meta + vendor */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Financial summary */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
            Financials
          </h3>
          <dl style={{ margin: 0 }}>
            {[
              { label: 'Subtotal', value: formatPHP(po.subtotal_cents) },
              { label: 'VAT (12%)', value: `+${formatPHP(po.vat_cents)}` },
              { label: 'Withholding Tax (2%)', value: `−${formatPHP(po.withholding_tax_cents)}` },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <dt style={{ fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>{label}</dt>
                <dd style={{ fontSize: '0.875rem', color: 'var(--color-neutral-700)', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{value}</dd>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <dt style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-neutral-800)' }}>Total</dt>
              <dd style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-neutral-900)', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
                {formatPHP(po.total_cents)}
              </dd>
            </div>
          </dl>
          {po.delivery_date && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)', fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
              Delivery by{' '}
              <strong style={{ color: 'var(--color-neutral-800)' }}>
                {new Date(po.delivery_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </strong>
            </div>
          )}
        </div>

        {/* Vendor info */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
            Vendor
          </h3>
          {po.vendor_name ? (
            <dl style={{ margin: 0 }}>
              {[
                { label: 'Name', value: po.vendor_name },
                { label: 'Contact', value: po.vendor_contact },
                { label: 'Email', value: po.vendor_email },
                { label: 'Phone', value: po.vendor_phone },
                { label: 'BIR TIN', value: po.vendor_tin },
              ]
                .filter(({ value }) => value)
                .map(({ label, value }) => (
                  <div key={label} style={{ marginBottom: '10px' }}>
                    <dt style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
                      {label}
                    </dt>
                    <dd style={{ fontSize: '0.875rem', color: 'var(--color-neutral-800)', margin: 0 }}>{value}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-400)', margin: 0 }}>
              No vendor assigned.{' '}
              <Link href="/procurement" style={{ color: 'var(--color-navy-700)' }}>
                Manage vendors →
              </Link>
            </p>
          )}
        </div>
      </div>

      {canManagePayables && (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            overflow: 'hidden',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--color-neutral-800)',
                  margin: 0,
                }}
              >
                Matched supplier bills ({payableRows.length})
              </h2>
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-neutral-500)',
                  margin: '4px 0 0',
                }}
              >
                Purchase Order is commitment evidence. Only posted bills create
                payables.
              </p>
            </div>
            {canStartSupplierBill && (
              <Link
                href={`/finance/payables/new?po=${po.id}`}
                className="finance-primary-link"
              >
                Match supplier bill
              </Link>
            )}
          </div>
          {payableRows.length === 0 ? (
            <div
              style={{
                padding: '24px 20px',
                color: 'var(--color-neutral-500)',
                fontSize: '0.875rem',
              }}
            >
              No supplier bill has been matched to this Purchase Order.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="numeric">Payable</th>
                </tr>
              </thead>
              <tbody>
                {payableRows.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      <Link href={`/finance/payables/${bill.id}`}>
                        {bill.internalNumber ?? bill.vendorBillNumber}
                      </Link>
                    </td>
                    <td>{bill.billDate}</td>
                    <td>
                      <span
                        className={`finance-status finance-status-${bill.status}`}
                      >
                        {bill.status}
                      </span>
                    </td>
                    <td className="numeric">
                      {formatPHP(bill.totalPayableCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Line items */}
      {po.project_id && (
        <div className="budget-panel" style={{ marginBottom: 16 }}>
          <div className="budget-panel-heading">
            <div>
              <p className="finance-eyebrow">Commitment control</p>
              <h2>
                {approvedBudget
                  ? `Budget revision ${approvedBudget.revision}`
                  : 'No approved Project Budget'}
              </h2>
            </div>
            <p>
              {approvedBudget
                ? `${approvedBudget.controlMode} mode · ${(approvedBudget.toleranceBps / 100).toFixed(2)}% tolerance`
                : 'This Purchase Order is not checked against a controlled baseline.'}
              {' '}
              <Link href={`/projects/${po.project_id}/cost/budget`}>
                Open Budget Control
              </Link>
            </p>
          </div>
          {approvedBudget && (
            <div className="finance-table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cost Code</th>
                    <th className="numeric">Baseline</th>
                    <th className="numeric">Other committed</th>
                    <th className="numeric">This PO</th>
                    <th className="numeric">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetControlRows.map((row) => {
                    const limit =
                      row.baseline_cents +
                      Math.round(
                        (row.baseline_cents * approvedBudget.toleranceBps) /
                          10_000
                      )
                    const remaining =
                      limit -
                      row.other_committed_cents -
                      row.current_po_cents
                    return (
                      <tr key={row.cost_code_id}>
                        <td>
                          <strong>{row.code}</strong>
                          <span className="finance-cell-detail">{row.name}</span>
                        </td>
                        <td className="numeric">
                          {formatPHP(row.baseline_cents)}
                        </td>
                        <td className="numeric">
                          {formatPHP(row.other_committed_cents)}
                        </td>
                        <td className="numeric">
                          {formatPHP(row.current_po_cents)}
                        </td>
                        <td
                          className={`numeric ${
                            remaining < 0 ? 'budget-negative-text' : ''
                          }`}
                        >
                          {formatPHP(remaining)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-800)', margin: 0 }}>
            Line Items ({lines.length})
          </h2>
        </div>

        {lines.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.875rem' }}>
            No line items
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)' }}>
                {['#', 'Item', 'Description', 'Cost Code', 'Qty', 'Unit', 'Unit Cost', 'Line Total', 'Received'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px',
                      textAlign: i >= 3 ? 'right' : 'left',
                      fontWeight: 600,
                      color: 'var(--color-neutral-600)',
                      fontSize: '0.8125rem',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr
                  key={line.id}
                  style={{ borderBottom: idx < lines.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                >
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-400)', fontSize: '0.8125rem', width: 40 }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-500)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>
                    {line.code ?? '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-800)', fontWeight: 500 }}>
                    {line.description}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <CostCodeAssignment
                      lineId={line.id}
                      currentId={line.cost_code_id}
                      editable={po.status === 'draft'}
                      codes={costCodeRows}
                    />
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                    {line.quantity.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--color-neutral-500)' }}>
                    {line.unit ?? '—'}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-neutral-700)' }}>
                    {formatPHP(line.unit_cost_cents)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
                    {formatPHP(line.line_total_cents)}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <ReceiveLineForm
                      quantity={line.quantity}
                      receivedQty={line.received_qty}
                      disabled={po.status === 'cancelled'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-neutral-50)' }}>
                <td colSpan={7} style={{ padding: '12px 16px', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-neutral-700)', textAlign: 'right' }}>
                  Total
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-neutral-900)' }}>
                  {formatPHP(lines.reduce((s, l) => s + l.line_total_cents, 0))}
                </td>
                <td style={{ padding: '12px 16px' }} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {po.notes && (
        <div
          style={{
            marginTop: '16px',
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
            Notes
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-700)', margin: 0, lineHeight: 1.6 }}>{po.notes}</p>
        </div>
      )}
    </div>
  )
}
