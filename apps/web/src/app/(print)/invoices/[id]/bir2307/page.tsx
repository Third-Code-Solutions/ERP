import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requirePrintProfile } from '@/lib/operations/print-authorization'
import { db } from '@third-code-erp/database'
import { accounts, invoices, projects, tenants } from '@third-code-erp/database/schema'
import { and, eq, sql } from 'drizzle-orm'
import { PrintButton } from './print-button'
import { companyDocumentIdentity, missingDocumentIdentityFields, resolveDocumentIdentity } from '@/lib/operations/company-document-identity'

export const metadata: Metadata = { title: 'BIR 2307 Worksheet' }

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function periodCovered(d: Date | string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  const y = date.getFullYear()
  const m = date.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  const fmt = (x: Date) =>
    x.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

export default async function Bir2307PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await requirePrintProfile('invoice', id)

  const [inv] = await db
    .select({
      id: invoices.id,
      invoice_number: invoices.invoice_number,
      status: invoices.status,
      issued_at: invoices.issued_at,
      issuance_journal_entry_id: invoices.issuance_journal_entry_id,
      reversed_at: invoices.reversed_at,
      pricing_basis: invoices.pricing_basis,
      withholding_bps: invoices.withholding_bps,
      issuer_legal_profile: invoices.issuer_legal_profile,
      subtotal_cents: invoices.subtotal_cents,
      retention_cents: invoices.retention_cents,
      withholding_tax_cents: invoices.withholding_tax_cents,
      created_at: invoices.created_at,
      project_name: projects.name,
      project_client: projects.client,
      project_location: projects.location,
      account_name: accounts.name,
      account_address: accounts.billing_address,
    })
    .from(invoices)
    .leftJoin(
      projects,
      and(eq(invoices.project_id, projects.id), eq(projects.tenant_id, profile.tenantId)),
    )
    .leftJoin(
      accounts,
      and(
        sql`${accounts.id} = coalesce(${invoices.account_id}, ${projects.account_id})`,
        eq(accounts.tenant_id, profile.tenantId),
      ),
    )
    .where(and(eq(invoices.id, id), eq(invoices.tenant_id, profile.tenantId)))

  if (!inv) return notFound()

  const [tenant] = await db
    .select({ name: tenants.name, legal_name: tenants.legal_name, registered_address: tenants.registered_address, document_email: tenants.document_email, document_phone: tenants.document_phone, bir_tin: tenants.bir_tin, pcab_license: tenants.pcab_license })
    .from(tenants)
    .where(eq(tenants.id, profile.tenantId))

  // Match the persisted ADR-041 allocation; do not reinterpret legacy records.
  const taxBaseCents = inv.pricing_basis === 'reconciled_v1'
    ? inv.subtotal_cents
    : Math.max(0, inv.subtotal_cents - inv.retention_cents)
  const withholdingRate = inv.pricing_basis === 'reconciled_v1' ? `${inv.withholding_bps / 100}%` : 'Legacy rate unverified'
  const currentIdentity = tenant ? companyDocumentIdentity({ workspace_name: tenant.name, ...tenant }) : null
  const previouslyIssued = Boolean(inv.issued_at || inv.issuance_journal_entry_id || inv.reversed_at) || ['issued', 'partial_payment', 'paid', 'overdue'].includes(inv.status)
  const { identity } = resolveDocumentIdentity({ current: currentIdentity, snapshot: inv.issuer_legal_profile, previouslyIssued })
  const missingFields = [
    ...(identity ? missingDocumentIdentityFields(identity).map((field) => `payee ${field}`) : ['payee identity snapshot']),
    ...(!inv.account_name ? ['payor registered name'] : []),
    ...(!inv.account_address ? ['payor registered address'] : []),
    'payor TIN',
  ]

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
        {/* Draft watermark notice */}
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
          WORKSHEET — NOT AN OFFICIAL BIR FORM. INCOMPLETE: {missingFields.join(', ')}. Verify all data against the current official BIR form before use.
        </div>

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
            BIR 2307 WORKSHEET
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
            <div style={{ fontWeight: 600, marginTop: '2px' }}>{periodCovered(inv.created_at)}</div>
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

        {/* Two-column payor / payee header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            border: '1px solid #111827',
            marginBottom: '16px',
          }}
        >
          {/* Part I — Payor (Withholding Agent / customer) */}
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
              Part I — Payor (Withholding Agent)
            </div>
            <FieldRow label="Registered Name" value={inv.account_name ?? inv.project_client ?? '—'} />
            <FieldRow label="TIN" value="—" mono />
            <FieldRow label="Registered Address" value={inv.account_address ?? '—'} />
          </div>

          {/* Part II — Payee (contractor) */}
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
              Part II — Payee
            </div>
            <FieldRow label="Registered Name" value={identity?.legal_name ?? '—'} />
            <FieldRow label="TIN" value={identity?.bir_tin ?? '—'} mono />
            <FieldRow label="Registered Address" value={identity?.registered_address ?? '—'} />
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
              <td style={cellRight}>{withholdingRate}</td>
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

        {/* Preparation note */}
        <div
          style={{
            fontSize: '11px',
            color: '#374151',
            marginBottom: '24px',
            lineHeight: 1.55,
          }}
        >
          ABI OPS prepared this worksheet from invoice and workspace data. It is incomplete while
          any field above is missing and does not certify BIR registration, filing, or acceptance.
        </div>

        {/* Signature blocks */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <div style={{ borderTop: '1px solid #111827', paddingTop: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>Payor / Withholding Agent</div>
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                {inv.account_name ?? inv.project_client ?? '—'}
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
                {identity?.legal_name ?? '—'}
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
          Generated by ABI OPS for invoice {inv.invoice_number}. This is a system-prepared
          working draft of BIR Form 2307. Verify all values against the official BIR template
          before issuing to the payee.
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
