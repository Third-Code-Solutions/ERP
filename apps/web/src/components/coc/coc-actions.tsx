'use client'

/**
 * Certificate of Completion actions for one project.
 *
 *   none                → Draft COC
 *   draft               → pick the signer, Send for client signature
 *   pending_signature   → Resend signing link | Cancel request
 *
 * Every action result is shown: errors in plain language, and the one-time
 * signing link (with a copy button) right after it is created. The link is a
 * bearer credential that is stored only as a hash, so it cannot be shown
 * again later; "Resend signing link" issues a fresh one.
 */

import React, { useState, useTransition } from 'react'
import {
  cancelCocSigningRequest,
  draftCoc,
  resendCocSigningLink,
  sendCocForSignature,
  type CocSigningLinkResult,
} from '@/app/(dashboard)/projects/[id]/coc/actions'
import { PortalLinkDisplay } from '@/components/canvas-sign/portal-link-display'

const COC_MANAGE_ROLES_LABEL = 'Admin, SD / PM / PE, PM and CX'

export interface CocActionsProps {
  projectId: string
  status: 'none' | 'draft' | 'pending_signature'
  /** Mirrors the punchlist.manage capability the server actions enforce. */
  canManage: boolean
  /** Prefill for the signer fields: primary contact or the previous signer. */
  signerDefaults: { name: string; email: string } | null
}

export function CocActions({ projectId, status, canManage, signerDefaults }: CocActionsProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<CocSigningLinkResult | null>(null)
  const [name, setName] = useState(signerDefaults?.name ?? '')
  const [email, setEmail] = useState(signerDefaults?.email ?? '')

  function run(task: () => Promise<CocSigningLinkResult>) {
    setError(null)
    startTransition(async () => {
      const result = await task()
      if (result.error) {
        setError(result.error)
        return
      }
      // The actions revalidate the page, so the status refreshes on its own.
      setLink(result.url ? result : null)
    })
  }

  const signer = { name, email }

  if (!canManage) {
    return (
      <p style={mutedNoteStyle}>
        {status === 'none'
          ? 'No certificate has been drafted yet. '
          : status === 'pending_signature'
            ? 'Awaiting the client’s signature. '
            : 'Ready to send for client signature. '}
        Only {COC_MANAGE_ROLES_LABEL} can draft or send it.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {status === 'pending_signature' ? (
        <p style={mutedNoteStyle}>
          Awaiting the client’s signature. Each signing link works for 48 hours. If the client did not
          get it or it expired, send a new link; the old one stops working.
        </p>
      ) : null}

      {status === 'draft' || status === 'pending_signature' ? (
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
          <legend style={{ ...labelStyle, marginBottom: 6 }}>Client signer</legend>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelStyle}>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              maxLength={255}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelStyle}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              maxLength={255}
              style={inputStyle}
            />
          </label>
          <p style={{ ...mutedNoteStyle, gridColumn: '1 / -1' }}>
            The signing link is emailed to this person and shown below so you can also send it
            yourself.
          </p>
        </fieldset>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {status === 'none' ? (
          <button type="button" disabled={pending} onClick={() => run(() => draftCoc(projectId))} style={primaryBtnStyle}>
            {pending ? 'Working…' : 'Draft COC'}
          </button>
        ) : null}
        {status === 'draft' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => sendCocForSignature(projectId, signer))}
            style={primaryBtnStyle}
          >
            {pending ? 'Sending…' : 'Send for client signature'}
          </button>
        ) : null}
        {status === 'pending_signature' ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => resendCocSigningLink(projectId, signer))}
              style={primaryBtnStyle}
            >
              {pending ? 'Sending…' : 'Resend signing link'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    'Cancel this signature request? The current link stops working and the certificate goes back to draft.'
                  )
                ) {
                  run(() => cancelCocSigningRequest(projectId))
                }
              }}
              style={secondaryBtnStyle}
            >
              Cancel request
            </button>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" style={{ margin: 0, color: 'var(--color-danger, #b00020)', fontSize: 13 }}>
          {error}
        </p>
      ) : null}

      {link?.url ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-700)' }}>
            {link.emailed
              ? `The signing link was emailed to ${link.signerEmail}.`
              : `The email to ${link.signerEmail} could not be confirmed as sent. Copy the link below and send it to the client yourself.`}
          </p>
          <PortalLinkDisplay url={link.url} expiresAt={link.expiresAt} />
        </div>
      ) : null}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-neutral-600)',
}

const mutedNoteStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.8125rem',
  color: 'var(--color-neutral-600)',
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  background: 'var(--color-navy-700)',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  background: 'var(--color-surface)',
  color: 'var(--color-neutral-700)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontWeight: 500,
  fontSize: '0.875rem',
  cursor: 'pointer',
}
