import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import { requireRouteAccess } from '@/lib/require-route-access'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { can, getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { accounts, invoices, projects, tenants } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { formatManilaLongDate, manilaToday } from '@/lib/manila-date'
import {
  bir2307Available,
  invoiceDocumentState,
  invoiceStateMark,
  invoiceStateNotice,
} from '@/app/(print)/invoices/invoice-document-state'
import {
  invoiceClientAccountJoin,
  withholdingRateLabel,
  withholdingTaxBaseCents,
} from '@/app/(print)/invoices/invoice-print'
import { PrintButton } from './print-button'

export const metadata: Metadata = { title: 'BIR Form 2307' }

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—'
  return formatManilaLongDate(d)
}

/** The Manila calendar month the invoice was issued in: the BIR return period. */
function periodCovered(d: Date | string | null): string {
  if (!d) return '—'
  const month = manilaToday(new Date(d)).slice(0, 7)
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year ?? 0, monthNumber ?? 0, 0)).getUTCDate()
  return `${formatManilaLongDate(`${month}-01`)} – ${formatManilaLongDate(`${month}-${lastDay}`)}`
}

export default async function Bir2307PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await getUserProfile()
  // Same finance.read gate as the dashboard invoice page.
  if (!profile || !can(profile.role, 'finance.read')) return notFound()
  // Print pages sit outside the dashboard layout: repeat the role rule of the page they print.
  requireRouteAccess(profile.role, '/invoices/[id]')

  const [inv] = await db
    .select({
      id: invoices.id,
      invoice_number: invoices.invoice_number,
      status: invoices.status,
      subtotal_cents: invoices.subtotal_cents,
      retention_cents: invoices.retention_cents,
      withholding_tax_cents: invoices.withholding_tax_cents,
      created_at: invoices.created_at,
      issued_at: invoices.issued_at,
      reversed_at: invoices.reversed_at,
      project_id: invoices.project_id,
      project_name: projects.name,
      project_client: projects.client,
      client_account_id: accounts.id,
      client_name: accounts.name,
      client_address: accounts.billing_address,
    })
    .from(invoices)
    .leftJoin(
      projects,
      and(eq(invoices.project_id, projects.id), eq(projects.tenant_id, profile.tenantId)),
    )
    // The same client the invoice print bills: the invoice's account, else its project's.
    .leftJoin(accounts, invoiceClientAccountJoin(profile.tenantId))
    .where(and(eq(invoices.id, id), eq(invoices.tenant_id, profile.tenantId)))

  if (!inv) return notFound()

  // A draft or cancelled invoice has no withholding to certify.
  const documentState = invoiceDocumentState(inv)
  if (!bir2307Available(documentState)) return notFound()
  const stateMark = invoiceStateMark(documentState)
  const stateNotice = invoiceStateNotice(documentState)

  const [tenant] = await db
    .select({ name: tenants.name, bir_tin: tenants.bir_tin, pcab_license: tenants.pcab_license })
    .from(tenants)
    .where(eq(tenants.id, profile.tenantId))

  // D-8: on a customer invoice the client withholds (payor) and the tenant
  // contractor receives the income (payee).
  const payeeName = tenant?.name.trim() || null
  const payeeTin = tenant?.bir_tin?.trim() || null
  const payorName = inv.client_name?.trim() || inv.project_client?.trim() || null

  // A tax form with a blank party is refused, not printed.
  if (!payeeName || !payeeTin || !payorName) {
    const workspace = { where: 'Settings → Workspace', href: '/settings' }
    const payorFix = inv.client_account_id
      ? { where: 'the client account page', href: `/crm/accounts/${inv.client_account_id}` }
      : { where: 'the project page (client or client account)', href: `/projects/${inv.project_id}` }
    const missing: MissingField[] = [
      ...(payeeName ? [] : [{ field: 'Payee registered name', ...workspace }]),
      ...(payeeTin ? [] : [{ field: 'Payee BIR TIN', ...workspace }]),
      ...(payorName ? [] : [{ field: 'Payor name', ...payorFix }]),
    ]
    return <CannotPrepare invoiceId={id} invoiceNumber={inv.invoice_number} missing={missing} />
  }

  // Retention is held by the client and is not yet income for the period.
  const taxBaseCents = withholdingTaxBaseCents(inv)
  const rateLabel = withholdingRateLabel(inv)

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '32px 16px',
        background: '#f3f4f6',
      }}
    >
      {/* Toolbar — hidden when printing */}
      <div
        className="no-print"
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          display: 'flex',
          gap: '8px',
          zIndex: 50,
        }}
      >
        <Link
          href={`/invoices/${id}`}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 500,
            background: 'white',
            color: '#374151',
            border: '1px solid #d1d5db',
            textDecoration: 'none',
          }}
        >
          ← Back
        </Link>
        <PrintButton />
      </div>

      {/* A4 BIR 2307 document */}
      <div
        style={{
          background: 'white',
          width: '210mm',
          minHeight: '297mm',
          padding: '18mm 18mm 22mm',
          boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
          fontSize: '12px',
          lineHeight: 1.45,
          color: '#111827',
        }}
      >
        {/* Working-copy notice */}
        <div
          style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            color: '#78350f',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            textAlign: 'center',
            marginBottom: '16px',
            letterSpacing: '0.04em',
          }}
        >
          WORKING COPY — not a BIR certificate. Check every value against the official BIR Form 2307 before
          giving anything to the payor.
        </div>
        {stateMark && stateNotice && (
          <div
            role="note"
            style={{
              background: '#fef2f2',
              border: '2px solid #b91c1c',
              color: '#7f1d1d',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              textAlign: 'center',
              marginBottom: '16px',
            }}
          >
            {stateMark}: {stateNotice}
          </div>
        )}

        {/* Title block */}
        <div
          style={{
            border: '2px solid #111827',
            padding: '12px 16px',
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '10px', color: '#374151', marginBottom: '2px' }}>
            Republic of the Philippines · Department of Finance · Bureau of Internal Revenue
          </div>
          <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.02em' }}>
            BIR FORM 2307 — WORKING COPY
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>
            Certificate of Creditable Tax Withheld at Source
          </div>
        </div>

        {/* Period covered */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            border: '1px solid #111827',
            marginBottom: '16px',
          }}
        >
          <div style={{ borderRight: '1px solid #111827', padding: '8px 12px' }}>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              For the Period
            </div>
            <div style={{ fontWeight: 600, marginTop: '2px' }}>{periodCovered(inv.issued_at ?? inv.created_at)}</div>
          </div>
          <div style={{ padding: '8px 12px' }}>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Date Prepared
            </div>
            <div style={{ fontWeight: 600, marginTop: '2px' }}>{formatDate(new Date())}</div>
          </div>
        </div>

        {/* Two-column payee / payor header (BIR 2307 Part I / Part II) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            border: '1px solid #111827',
            marginBottom: '16px',
          }}
        >
          {/* Part I — Payee (the tenant contractor) */}
          <div style={{ borderRight: '1px solid #111827', padding: '12px 14px' }}>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '6px',
              }}
            >
              Part I — Payee
            </div>
            <FieldRow label="Registered Name" value={payeeName} />
            <FieldRow label="TIN" value={payeeTin} mono />
            {tenant?.pcab_license && (
              <FieldRow label="PCAB License" value={tenant.pcab_license} />
            )}
            <FillInRow label="Registered Address" />
          </div>

          {/* Part II — Payor (the client withholds the tax) */}
          <div style={{ padding: '12px 14px' }}>
            <div
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '6px',
              }}
            >
              Part II — Payor (Withholding Agent)
            </div>
            <FieldRow label="Registered Name" value={payorName} />
            <FillInRow label="TIN" />
            {inv.client_address ? (
              <FieldRow label="Registered Address" value={inv.client_address} />
            ) : (
              <FillInRow label="Registered Address" />
            )}
            <div
              style={{
                marginTop: '6px',
                fontSize: '10px',
                color: '#9ca3af',
                fontStyle: 'italic',
              }}
            >
              Client TIN is not on record — populate manually before issuing.
            </div>
          </div>
        </div>

        {/* Reference invoice */}
        <div
          style={{
            border: '1px solid #111827',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
          }}
        >
          <FieldRow label="Reference Invoice No." value={inv.invoice_number} mono />
          <FieldRow label="Project / Description" value={inv.project_name ?? '—'} />
        </div>

        {/* Part III — Income Payments / Tax Withheld */}
        <div style={{ marginBottom: '8px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#111827',
              marginBottom: '6px',
              letterSpacing: '0.02em',
            }}
          >
            Part III — Income Payments Subject to Expanded Withholding Tax
          </div>
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #111827',
            fontSize: '12px',
            marginBottom: '20px',
          }}
        >
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={cellHead}>Nature of Income Payment</th>
              <th style={cellHeadRight}>Gross Amount</th>
              <th style={cellHeadRight}>Less: Retention</th>
              <th style={cellHeadRight}>Tax Base</th>
              <th style={cellHeadRight}>Rate</th>
              <th style={cellHeadRight}>Tax Withheld</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={cell}>Income payment to contractor (services)</td>
              <td style={cellRight}>{formatPHP(inv.subtotal_cents)}</td>
              <td style={cellRight}>({formatPHP(inv.retention_cents)})</td>
              <td style={cellRight}>{formatPHP(taxBaseCents)}</td>
              <td style={cellRight}>{rateLabel}</td>
              <td style={cellRight}>{formatPHP(inv.withholding_tax_cents)}</td>
            </tr>
            <tr style={{ background: '#f9fafb' }}>
              <td style={{ ...cell, fontWeight: 700 }}>TOTAL</td>
              <td style={{ ...cellRight, fontWeight: 700 }}>{formatPHP(inv.subtotal_cents)}</td>
              <td style={{ ...cellRight, fontWeight: 700 }}>
                ({formatPHP(inv.retention_cents)})
              </td>
              <td style={{ ...cellRight, fontWeight: 700 }}>{formatPHP(taxBaseCents)}</td>
              <td style={cellRight}>—</td>
              <td style={{ ...cellRight, fontWeight: 800, color: '#7f1d1d' }}>
                {formatPHP(inv.withholding_tax_cents)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Money in words */}
        <div
          style={{
            border: '1px solid #111827',
            padding: '8px 14px',
            marginBottom: '20px',
            fontSize: '11px',
          }}
        >
          <div
            style={{
              fontSize: '9px',
              fontWeight: 700,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Total Tax Withheld
          </div>
          <div style={{ marginTop: '2px', fontWeight: 700, fontSize: '13px' }}>
            {formatPHP(inv.withholding_tax_cents)}
          </div>
        </div>

        {/* Certification block */}
        <div
          style={{
            fontSize: '11px',
            color: '#374151',
            marginBottom: '24px',
            lineHeight: 1.55,
          }}
        >
          We declare under the penalties of perjury that this certificate has been made in good
          faith, verified by us, and to the best of our knowledge and belief, is true and correct,
          pursuant to the provisions of the National Internal Revenue Code, as amended, and the
          regulations issued under authority thereof.
        </div>

        {/* Signature blocks */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <div style={{ borderTop: '1px solid #111827', paddingTop: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>Payor / Withholding Agent</div>
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                {payorName}
              </div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>
                Signature over Printed Name · Date
              </div>
            </div>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #111827', paddingTop: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>Payee</div>
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                {tenant?.name ?? '—'}
              </div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>
                Signature over Printed Name · Date
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: '36px',
            paddingTop: '12px',
            borderTop: '1px solid #e5e7eb',
            textAlign: 'center',
            fontSize: '10px',
            color: '#9ca3af',
          }}
        >
          Prepared for invoice {inv.invoice_number}. This is a system-prepared
          working copy of the BIR Form 2307 figures, not a BIR certificate. Verify all values against the
          official BIR template before issuing to the payee.
        </div>
      </div>
    </div>
  )
}

// ── Presentational helpers ────────────────────────────────────────────────────

interface FieldRowProps {
  label: string
  value: string
  mono?: boolean
}

function FieldRow({ label, value, mono }: FieldRowProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', fontSize: '11px', marginBottom: '4px' }}>
      <div style={{ color: '#6b7280', minWidth: '110px' }}>{label}:</div>
      <div
        style={{
          fontWeight: 600,
          color: '#111827',
          fontFamily: mono ? 'monospace' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  )
}

/** A blank line for a value the form needs but the system does not hold. */
function FillInRow({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px', fontSize: '11px', marginBottom: '4px' }}>
      <div style={{ color: '#6b7280', minWidth: '110px' }}>{label}:</div>
      <div style={{ flex: 1, borderBottom: '1px solid #111827', color: '#9ca3af', fontSize: '9px', fontStyle: 'italic' }}>
        to be completed
      </div>
    </div>
  )
}

interface MissingField {
  field: string
  where: string
  href: string
}

function CannotPrepare({
  invoiceId,
  invoiceNumber,
  missing,
}: {
  invoiceId: string
  invoiceNumber: string
  missing: MissingField[]
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '32px 16px',
        background: '#f3f4f6',
      }}
    >
      <section
        aria-labelledby="bir2307-blocked-heading"
        style={{
          background: 'white',
          width: '100%',
          maxWidth: '560px',
          padding: '24px',
          border: '2px solid #b91c1c',
          borderRadius: '8px',
          color: '#111827',
          fontSize: '13px',
          lineHeight: 1.5,
        }}
      >
        <h1 id="bir2307-blocked-heading" style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px', color: '#7f1d1d' }}>
          Cannot prepare BIR 2307
        </h1>
        <p style={{ margin: '0 0 12px' }}>
          Invoice {invoiceNumber} is missing details the form must carry. Add them, then open this page again.
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: '20px' }}>
          {missing.map((item) => (
            <li key={item.field}>
              <strong>{item.field}</strong>: set it on <Link href={item.href}>{item.where}</Link>.
            </li>
          ))}
        </ul>
        <Link href={`/invoices/${invoiceId}`}>← Back to the invoice</Link>
      </section>
    </div>
  )
}

const cellHead: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#374151',
  borderBottom: '1px solid #111827',
  borderRight: '1px solid #d1d5db',
}

const cellHeadRight: React.CSSProperties = {
  ...cellHead,
  textAlign: 'right',
}

const cell: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  borderRight: '1px solid #e5e7eb',
  borderTop: '1px solid #e5e7eb',
  color: '#111827',
}

const cellRight: React.CSSProperties = {
  ...cell,
  textAlign: 'right',
  fontFamily: 'monospace',
}
