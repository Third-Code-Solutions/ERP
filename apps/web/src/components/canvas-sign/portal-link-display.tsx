'use client'

/**
 * Portal Link Display — shown immediately after minting a signing session
 * (BOM portal, VO send-for-signature, COC send-for-signature, Contract).
 *
 * The URL embeds a one-shot token; the DB only stores SHA-256(token).
 * The operator MUST copy it now — re-displaying later requires re-minting.
 *
 * Keep this stateless and presentational. Parents own the mint action.
 */

import { useState } from 'react'

interface PortalLinkDisplayProps {
  url: string
  /** Optional ISO timestamp for the link expiry. */
  expiresAt?: string
  /** Signing mechanism — shown as a small label. */
  mechanism?: 'canvas' | 'docuseal'
  /** True when DOCUSEAL_API_URL/TOKEN unset and DocuSeal would have stubbed. */
  isDevStub?: boolean
}

export function PortalLinkDisplay({
  url,
  expiresAt,
  mechanism,
  isDevStub,
}: PortalLinkDisplayProps) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCopy() {
    setError(null)
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard not available in this browser')
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not copy link to clipboard',
      )
    }
  }

  const expiresLabel = expiresAt ? formatExpires(expiresAt) : null

  return (
    <div style={containerStyle}>
      <div style={headerRowStyle}>
        <span style={labelStyle}>Signing link</span>
        {mechanism ? (
          <span style={badgeStyle}>
            {mechanism === 'canvas' ? 'In-app signature' : 'DocuSeal'}
            {isDevStub ? ' · dev stub' : ''}
          </span>
        ) : null}
      </div>

      <div style={urlRowStyle}>
        <code style={urlBoxStyle} title={url}>
          {url}
        </code>
        <button type="button" onClick={handleCopy} style={copyButtonStyle}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {expiresLabel ? (
        <p style={metaTextStyle}>Link expires {expiresLabel}.</p>
      ) : null}

      <p style={warningTextStyle}>
        This link is shown once. Copy it now — re-displaying later requires
        minting a new token.
      </p>

      {error ? <p style={errorTextStyle}>{error}</p> : null}
    </div>
  )
}

function formatExpires(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  border: '1px solid var(--color-border, #e2e6ea)',
  borderRadius: 8,
  background: 'var(--color-neutral-50, #fafbfc)',
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--color-neutral-600, #5b6370)',
}

const badgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--color-neutral-100, #eef0f3)',
  color: 'var(--color-neutral-700, #3b424b)',
}

const urlRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'stretch',
}

const urlBoxStyle: React.CSSProperties = {
  flex: 1,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, "JetBrains Mono", monospace',
  fontSize: 12.5,
  padding: '8px 10px',
  background: 'white',
  border: '1px solid var(--color-border, #e2e6ea)',
  borderRadius: 6,
  color: 'var(--color-neutral-900, #1a1f26)',
  overflowX: 'auto',
  whiteSpace: 'nowrap',
  display: 'block',
}

const copyButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--color-navy-700, #1F3864)',
  color: 'white',
  fontWeight: 600,
  border: 0,
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
}

const metaTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--color-neutral-600, #5b6370)',
}

const warningTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  color: 'var(--color-warning-700, #8a5a00)',
}

const errorTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--color-danger, #b00020)',
}
