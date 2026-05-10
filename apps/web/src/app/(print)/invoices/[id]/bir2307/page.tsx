import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { invoices, projects, tenants, users } from '@buildops/database/schema'
import { and, eq } from 'drizzle-orm'
import { PrintButton } from './print-button'

export const metadata: Metadata = { title: 'BIR Form 2307' }

const WITHHOLDING_RATE_LABEL = '2%'

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
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

  const [inv] = await db
    .select({
      id: invoices.id,
      invoice_number: invoices.invoice_number,
      subtotal_cents: invoices.subtotal_cents,
      retention_cents: invoices.retention_cents,
      withholding_tax_cents: invoices.withholding_tax_cents,
      created_at: invoices.created_at,
      project_name: projects.name,
      project_client: projects.client,
      project_location: projects.location,
    })
    .from(invoices)
    .leftJoin(projects, eq(invoices.project_id, projects.id))
    .where(and(eq(invoices.id, id), eq(invoices.tenant_id, userRow.tenant_id)))

  if (!inv) return notFound()

  const [tenant] = await db
    .select({ name: tenants.name, bir_tin: tenants.bir_tin, pcab_license: tenants.pcab_license })
    .from(tenants)
    .where(eq(tenants.id, userRow.tenant_id))

  // Tax base: gross billing minus retention. Retention is held by the
  // client and is not yet income for the period — exclude from base.
  const taxBaseCents = Math.max(0, inv.subtotal_cents - inv.retention_cents)

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
          DRAFT — verify against official BIR template before issuing
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
            BIR FORM 2307
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
              Date Issued
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
          {/* Part I — Payor (Withholding Agent) */}
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
            <FieldRow label="Registered Name" value={tenant?.name ?? '—'} />
            <FieldRow
              label="TIN"
              value={tenant?.bir_tin ?? '—'}
              mono
            />
            {tenant?.pcab_license && (
              <FieldRow label="PCAB License" value={tenant.pcab_license} />
            )}
            <FieldRow label="Registered Address" value="—" />
          </div>

          {/* Part II — Payee */}
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
            <FieldRow label="Registered Name" value={inv.project_client ?? 'N/A'} />
            <FieldRow label="TIN" value="N/A" mono />
            <FieldRow label="Registered Address" value={inv.project_location ?? 'N/A'} />
            <div
              style={{
                marginTop: '6px',
                fontSize: '10px',
                color: '#9ca3af',
                fontStyle: 'italic',
              }}
            >
              Vendor record not linked to this invoice — populate manually before issuing.
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
              <td style={cellRight}>{WITHHOLDING_RATE_LABEL}</td>
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
                {tenant?.name ?? '—'}
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
                {inv.project_client ?? '—'}
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
          Generated by BuildOps ERP for invoice {inv.invoice_number}. This is a system-prepared
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
