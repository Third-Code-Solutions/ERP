'use client'

import React, { useState, useTransition } from 'react'
import { mintBomPortalToken } from '@/app/(dashboard)/bom/[bomId]/portal-actions'
import { PortalLinkDisplay } from '@/components/canvas-sign/portal-link-display'

interface BomSendToClientPanelProps {
  bomId: string
  // Account contact email; the sender can change it.
  defaultEmail: string
}

interface SentLinks {
  email: string
  signingUrl: string
  lineItemUrl: string | null
  expiresAt: string | null
  emailDelivered: boolean
}

function toAbsoluteUrl(url: string): string {
  return url.startsWith('/') ? `${window.location.origin}${url}` : url
}

export function BomSendToClientPanel({ bomId, defaultEmail }: BomSendToClientPanelProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<SentLinks | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    const recipient = email.trim()
    if (!recipient) {
      setError('Enter the client email to send the link to.')
      return
    }
    startTransition(async () => {
      try {
        const result = await mintBomPortalToken(bomId, recipient)
        if (result.error || !result.portal_url) {
          setError(result.error ?? 'The link could not be created. Try again.')
          return
        }
        setSent({
          email: recipient,
          signingUrl: toAbsoluteUrl(result.portal_url),
          lineItemUrl: result.line_item_url ? toAbsoluteUrl(result.line_item_url) : null,
          expiresAt: result.expires_at ?? null,
          emailDelivered: result.email_delivered !== false,
        })
      } catch {
        setError('The link could not be created. Check your connection and try again.')
      }
    })
  }

  return (
    <section
      id="bom-send-to-client"
      aria-label="Send this BOM to the client"
      style={{
        background: 'var(--color-neutral-50)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}
      >
        <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-neutral-500)' }}>
          <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Client email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="client@example.com"
            style={{
              minWidth: 260,
              padding: '6px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              fontSize: '0.8125rem',
            }}
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          style={{
            background: 'var(--color-navy-700)',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            padding: '7px 14px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          {isPending ? 'Sending…' : 'Email signing link'}
        </button>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-600)', flexBasis: '100%' }}>
          The client reviews the BOM and approves it online. Their approval locks the BOM. Links
          expire after 48 hours.
        </p>
      </form>

      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: 'var(--color-danger)' }}>
          {error}
        </p>
      ) : null}

      {sent ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {sent.emailDelivered ? (
            <p role="status" style={{ margin: 0, fontSize: 12.5, color: 'var(--color-neutral-700)' }}>
              The signing link was emailed to {sent.email}. Both links are shown once, so copy them
              now if you also want to send them yourself.
            </p>
          ) : (
            <p role="alert" style={{ margin: 0, fontSize: 12.5, color: 'var(--color-danger)' }}>
              The links were created, but the email to {sent.email} was not delivered. Copy the
              signing link now and send it to the client yourself. It is shown only once.
            </p>
          )}
          <PortalLinkDisplay
            label={sent.emailDelivered ? 'Signing page (emailed)' : 'Signing page (not emailed)'}
            url={sent.signingUrl}
            expiresAt={sent.expiresAt ?? undefined}
          />
          {sent.lineItemUrl ? (
            <PortalLinkDisplay
              label="Line-item page (client reviews every line, then approves)"
              url={sent.lineItemUrl}
              expiresAt={sent.expiresAt ?? undefined}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
