import type { Metadata } from 'next'
import { loadPortalBom, recordSign } from './sign-actions'

export const metadata: Metadata = {
  title: 'Review your BOM',
  robots: { index: false, follow: false },
}

// Force dynamic rendering — the token in params is per-link and must never
// be cached/prerendered at build time.
export const dynamic = 'force-dynamic'

const VAT_BPS = 1200 // 12%
const RETENTION_BPS = 1000 // 10%

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
    return <PortalStatus title="Link expired" body="This portal link has expired. Please ask your ABI contact to send a new one." />
  }
  if (result.state === 'used') {
    return <PortalStatus title="Already signed" body="This BOM has already been signed and locked." tone="positive" />
  }

  const bom = result.bom!
  const subtotal = bom.tcv_cents
  const vat = Math.round(subtotal * (VAT_BPS / 10000))
  const retention = Math.round(subtotal * (RETENTION_BPS / 10000))
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

  async function signAction(): Promise<void> {
    'use server'
    await recordSign(token)
  }

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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fafbfc' }}>
                      <th style={{ textAlign: 'left', padding: '8px 18px', fontSize: 11, color: '#6b7280' }}>Description</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, color: '#6b7280' }}>Qty</th>
                      <th style={{ textAlign: 'left', padding: '8px 8px', fontSize: 11, color: '#6b7280' }}>Unit</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, color: '#6b7280' }}>Unit cost</th>
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
                          {l.quantity.toLocaleString('en-PH')}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#6b7280' }}>{l.unit ?? '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-jetbrains), monospace' }}>
                          {fmtPHP(l.unit_cost_cents)}
                        </td>
                        <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 500, fontFamily: 'var(--font-jetbrains), monospace' }}>
                          {fmtPHP(l.line_total_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          <span style={{ color: '#4b5563' }}>VAT (12%)</span>
          <span style={{ textAlign: 'right', fontFamily: 'var(--font-jetbrains), monospace' }}>{fmtPHP(vat)}</span>
          <span style={{ color: '#4b5563' }}>Retention (10%)</span>
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
          document for execution. A counter-signed PDF will be emailed to you.
        </p>

        {bom.is_dev_stub ? (
          <div
            style={{
              border: '1px dashed #d8dde6',
              borderRadius: 8,
              padding: '16px 18px',
              color: '#6b7280',
              fontSize: 13,
              background: '#fafbfc',
              marginBottom: 14,
            }}
          >
            <strong style={{ color: '#0F2D4A' }}>DocuSeal preview (dev stub)</strong>
            <p style={{ margin: '6px 0 0' }}>
              In production this is an embedded DocuSeal signature panel. The stub here means
              DOCUSEAL_API_URL is not configured; clicking the approve button below still locks the BOM.
            </p>
          </div>
        ) : bom.docuseal_slug ? (
          <iframe
            src={bom.docuseal_slug.startsWith('http') ? bom.docuseal_slug : `/portal/dev-sign/${bom.docuseal_slug}`}
            title="Sign BOM"
            style={{ width: '100%', height: 480, border: '1px solid #d8dde6', borderRadius: 8, marginBottom: 14 }}
          />
        ) : null}

        <form action={signAction}>
          <button
            type="submit"
            style={{
              background: '#E07B2A',
              color: 'white',
              border: 0,
              padding: '12px 22px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.01em',
              boxShadow: '0 1px 3px rgba(224, 123, 42, 0.35)',
            }}
          >
            I approve this BOM
          </button>
        </form>
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
