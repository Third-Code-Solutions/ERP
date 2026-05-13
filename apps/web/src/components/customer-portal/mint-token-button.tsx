'use client'

/**
 * MintTokenButton — admin form for minting a customer-portal access link.
 *
 * On submit, calls `mintCustomerPortalAccess` server action. On success,
 * surfaces the plaintext URL via PortalLinkDisplay with a "shown once"
 * warning. The URL is NEVER retrievable after the response leaves the
 * client — re-display requires minting a new token.
 */

import { useState, useTransition } from 'react'
import { mintCustomerPortalAccess } from '@/app/(dashboard)/projects/[id]/access/actions'
import { PortalLinkDisplay } from '@/components/canvas-sign/portal-link-display'

interface MintTokenButtonProps {
  projectId: string
}

const DEFAULT_DAYS = 365

export function MintTokenButton({ projectId }: MintTokenButtonProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ url: string; expiresAt: string } | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('project_id', projectId)
    startTransition(async () => {
      const res = await mintCustomerPortalAccess(fd)
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.url && res.expiresAt) {
        setIssued({ url: res.url, expiresAt: res.expiresAt })
        // Reset the form so the operator can mint another after copying.
        e.currentTarget?.reset?.()
      }
    })
  }

  return (
    <div style={containerStyle}>
      <h3 style={titleStyle}>Mint a new client link</h3>
      <p style={subtitleStyle}>
        Send the resulting URL to your client. They&rsquo;ll see live project status without
        an ABI login. The link is read-only and expires after the period you set.
      </p>

      <form onSubmit={handleSubmit} style={formStyle}>
        <div style={fieldGridStyle}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Client name</span>
            <input
              name="viewer_name"
              required
              placeholder="e.g. Maria Santos"
              maxLength={255}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Client email</span>
            <input
              name="viewer_email"
              type="email"
              required
              placeholder="client@example.com"
              maxLength={255}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Valid for (days)</span>
            <input
              name="days"
              type="number"
              required
              min={1}
              max={3650}
              defaultValue={DEFAULT_DAYS}
              style={inputStyle}
            />
          </label>
        </div>

        <button type="submit" disabled={pending} style={submitButtonStyle(pending)}>
          {pending ? 'Minting…' : 'Mint client link'}
        </button>

        {error ? <p style={errorStyle}>{error}</p> : null}
      </form>

      {issued ? (
        <div style={{ marginTop: 16 }}>
          <PortalLinkDisplay url={issued.url} expiresAt={issued.expiresAt} />
        </div>
      ) : null}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid var(--color-border, #e2e6ea)',
  borderRadius: 10,
  padding: '20px 22px',
  marginBottom: 20,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--color-navy-700, #1F3864)',
}

const subtitleStyle: React.CSSProperties = {
  margin: '6px 0 16px',
  fontSize: 13,
  color: 'var(--color-neutral-600, #5b6370)',
  lineHeight: 1.5,
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 1fr) 140px',
  gap: 12,
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const labelTextStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-600, #5b6370)',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13.5,
  border: '1px solid var(--color-border, #e2e6ea)',
  borderRadius: 6,
  background: 'white',
  color: 'var(--color-neutral-900, #1a1f26)',
}

function submitButtonStyle(pending: boolean): React.CSSProperties {
  return {
    alignSelf: 'flex-start',
    padding: '10px 18px',
    background: pending ? 'var(--color-neutral-300, #c4cad2)' : 'var(--color-navy-700, #1F3864)',
    color: 'white',
    fontWeight: 600,
    fontSize: 13.5,
    border: 0,
    borderRadius: 6,
    cursor: pending ? 'not-allowed' : 'pointer',
  }
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: 'var(--color-danger, #b00020)',
}
