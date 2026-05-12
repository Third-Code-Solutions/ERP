'use client'

/**
 * "Mint warranty portal token" button (REFACTOR.md US-WA-001).
 *
 * Admin/CX-only. Calls the server action which returns the plaintext token +
 * URL exactly once; we render a copy-to-clipboard surface that the user can
 * email to the client.
 */

import { useState, useTransition } from 'react'
import { mintWarrantyPortalToken } from '@/app/(dashboard)/warranty/actions'

interface Props {
  projectId: string
  label?: string
}

export function MintWarrantyPortalToken({
  projectId,
  label = 'Mint warranty portal link',
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [issuedUrl, setIssuedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleMint() {
    setError(null)
    setIssuedUrl(null)
    setCopied(false)
    startTransition(async () => {
      const result = await mintWarrantyPortalToken(projectId)
      if (result.error) {
        setError(result.error)
      } else if (result.url) {
        setIssuedUrl(result.url)
      }
    })
  }

  async function handleCopy() {
    if (!issuedUrl) return
    try {
      await navigator.clipboard.writeText(issuedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Copy failed — select the link manually.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        onClick={handleMint}
        disabled={isPending}
        style={{
          background: 'var(--color-navy-700, #0F2D4A)',
          color: 'white',
          border: 'none',
          padding: '8px 14px',
          borderRadius: 6,
          fontWeight: 600,
          fontSize: 13,
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
          alignSelf: 'flex-start',
        }}
      >
        {isPending ? 'Minting…' : label}
      </button>

      {error && (
        <div style={{ color: 'var(--color-danger, #b42318)', fontSize: 12.5 }}>{error}</div>
      )}

      {issuedUrl && (
        <div
          style={{
            background: '#f4f6f9',
            border: '1px solid #c4cdd9',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: '#525866' }}>
            Copy this link and email it to the client. It is shown <strong>once</strong>{' '}
            and expires in 1 year.
          </p>
          <code
            style={{
              fontSize: 12,
              padding: 8,
              background: 'white',
              borderRadius: 4,
              border: '1px solid #e1e4ea',
              wordBreak: 'break-all',
            }}
          >
            {issuedUrl}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              alignSelf: 'flex-start',
              background: 'white',
              border: '1px solid #d0d5dd',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  )
}
