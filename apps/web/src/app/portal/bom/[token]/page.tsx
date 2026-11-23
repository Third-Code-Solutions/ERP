import type { Metadata } from 'next'
import React from 'react'
import { z } from 'zod'
import { formatBps } from '@third-code-erp/shared-types'
import { computeRetention, computeVAT, formatBoqQuantity } from '@third-code-erp/shared-types/bom'
import { PortalSignForm } from './portal-sign-form'
import { loadPortalBom } from './sign-actions'

export const metadata: Metadata = {
  title: 'Review your BOM',
  robots: { index: false, follow: false },
}

// Force dynamic rendering — the token in params is per-link and must never
// be cached/prerendered at build time.
export const dynamic = 'force-dynamic'

const signingUrlSchema = z.string().url().refine((value) => {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
})

function fmtPHP(cents: number): string {
  return (
    '₱' +
    (cents / 100).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

export default async function PortalBomPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await loadPortalBom(token)

  if (result.state === 'not_found') {
    return <PortalStatus title="Link not found" body="This portal link doesn't match any active BOM." />
  }
  if (result.state === 'expired') {
    return <PortalStatus title="Link expired" body="This portal link has expired. Please ask your project contact to send a new one." />
  }
  if (result.state === 'used') {
    return <PortalStatus title="Already signed" body="This BOM has already been signed and locked." tone="positive" />
  }

  const bom = result.bom!
  // A link outlives the BOM's state: only an approved BOM can be signed.
  if (bom.status === 'locked') {
    return <PortalStatus title="Already approved" body="This BOM has already been approved and locked." tone="positive" />
  }
  if (bom.status !== 'approved') {
    return (
      <PortalStatus
        title="Not open for approval"
        body="This BOM is not open for client approval right now. Please ask your project contact for a new link."
      />
    )
  }
  const taxRates = result.taxRates!
  // Historical rows also contain provider slugs; they are not application routes.
  const signingUrl = signingUrlSchema.safeParse(bom.docuseal_slug)
  const subtotal = bom.tcv_cents
  const vat = computeVAT(subtotal, taxRates.vatBps)
  const retention = computeRetention(subtotal, taxRates.retentionBps)
  const payable = subtotal + vat - retention

  // Group lines by category.
  const grouped = new Map<string, typeof bom.lines>()
  for (const line of bom.lines) {
    const arr = grouped.get(line.category) ?? []
    arr.push(line)
    grouped.set(line.category, arr)
  }
  const groups = Array.from(grouped.entries())

  const validUntil = new Date(bom.valid_until).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div>
      {/* Header card */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          padding: '24px 28px',
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.05)',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 600 }}>
              Bill of Materials · v{bom.version}
            </p>
            <h2 style={{ margin: '6px 0 4px', fontSize: 22, color: '#0F2D4A', fontWeight: 600 }}>
              {bom.project_name}
            </h2>
            {bom.account_name && (
              <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>
                Prepared for <strong>{bom.account_name}</strong>
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 600 }}>
              Valid until
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: '#0F2D4A', fontWeight: 500 }}>
              {validUntil}
            </p>
          </div>
        </div>
      </section>

      {/* Lines grouped by category */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        {groups.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
            No line items in this BOM yet.
          </div>
        ) : (
          groups.map(([cat, lines]) => {
            const groupTotal = lines.reduce((s, l) => s + l.line_total_cents, 0)
            return (
              <div key={cat}>
                <div
                  style={{
                    background: '#0F2D4A',
                    color: 'white',
                    padding: '10px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  <span>{cat}</span>
                  <span style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>{fmtPHP(groupTotal)}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fafbfc' }}>
                      <th style={{ textAlign: 'left', padding: '8px 18px', fontSize: 11, color: '#6b7280' }}>Description</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, color: '#6b7280' }}>Qty</th>
                      <th style={{ textAlign: 'left', padding: '8px 8px', fontSize: 11, color: '#6b7280' }}>Unit</th>
                      <th style={{ textAlign: 'right', padding: '8px 18px', fontSize: 11, color: '#6b7280' }}>Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #f1f3f6' }}>
                        <td style={{ padding: '10px 18px' }}>
                          {l.code && (
                            <code style={{ fontSize: 11, color: '#6b7280', marginRight: 6 }}>{l.code}</code>
                          )}
                          {l.description}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-jetbrains), monospace' }}>
                          {formatBoqQuantity(l.quantity)}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#6b7280' }}>{l.unit ?? '—'}</td>
                        <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 500, fontFamily: 'var(--font-jetbrains), monospace' }}>
                          {fmtPHP(l.line_total_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )
          })
        )}
      </section>

      {/* Totals */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          padding: '20px 24px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 32px', fontSize: 14 }}>
          <span style={{ color: '#4b5563' }}>Subtotal</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-jetbrains), monospace' }}>{fmtPHP(subtotal)}</span>
          <span style={{ color: '#4b5563' }}>VAT ({formatBps(taxRates.vatBps)})</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-jetbrains), monospace' }}>{fmtPHP(vat)}</span>
          <span style={{ color: '#4b5563' }}>Retention ({formatBps(taxRates.retentionBps)})</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-jetbrains), monospace' }}>− {fmtPHP(retention)}</span>
          <span style={{ borderTop: '1px solid #d8dde6', paddingTop: 8, color: '#0F2D4A', fontWeight: 600, fontSize: 15 }}>
            Total payable
          </span>
          <span style={{ borderTop: '1px solid #d8dde6', paddingTop: 8, textAlign: 'right', color: '#0F2D4A', fontWeight: 600, fontSize: 15, fontFamily: 'var(--font-jetbrains), monospace' }}>
            {fmtPHP(payable)}
          </span>
        </div>
      </section>

      {/* Signature area */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          padding: '20px 24px',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 15, color: '#0F2D4A' }}>Signature</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#4b5563', lineHeight: 1.55 }}>
          Reviewing this BOM and clicking <em>I approve this BOM</em> records your acceptance and locks the
          document for execution.
        </p>

        {bom.is_dev_stub ? (
          <div
            style={{
              border: '1px solid #e5b567',
              borderRadius: 8,
              padding: '16px 18px',
              color: '#6b4b16',
              fontSize: 13,
              background: '#fff8e8',
              marginBottom: 14,
              lineHeight: 1.55,
            }}
            role="alert"
          >
            <strong style={{ color: '#6b4b16' }}>Signing link unavailable</strong>
            <p style={{ margin: '6px 0 0' }}>
              This legacy development link cannot record an approval. Ask the
              project team to issue a new secure signing link from the workspace.
            </p>
          </div>
        ) : signingUrl.success ? (
          <p>
            <a href={signingUrl.data} target="_blank" rel="noopener noreferrer">
              Open secure signing page
            </a>
          </p>
        ) : (
          <p>Ask the project team for a current secure signing link if you need the external signing page.</p>
        )}

        {!bom.is_dev_stub && <PortalSignForm token={token} />}
      </section>
    </div>
  )
}

function PortalStatus({
  title,
  body,
  tone = 'neutral',
}: {
  title: string
  body: string
  tone?: 'neutral' | 'positive'
}) {
  return (
    <section
      style={{
        background: 'white',
        border: '1px solid #d8dde6',
        borderRadius: 10,
        padding: '40px 32px',
        textAlign: 'center',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 22,
          color: tone === 'positive' ? '#0F2D4A' : '#4b5563',
        }}
      >
        {title}
      </h2>
      <p style={{ margin: '10px 0 0', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{body}</p>
    </section>
  )
}
