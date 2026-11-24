'use client'

/**
 * Approval CTAs rendered on the VO detail page.
 *
 * Which buttons render depends on the VO's current status:
 *   draft                       → Submit for commercial pricing | Reject
 *   pending_commercial_pricing  → Send for client signature     | Reject
 *   pending_client_signature    → Resend signing link | Cancel request | Reject
 *   signed / rejected           → no actions
 *
 * The signing link is a bearer credential stored only as a hash, so it is
 * shown once, right after it is created, with a copy button. Nothing emails
 * it: the sender passes it to the client. Links expire after 48 hours, so
 * "Resend signing link" issues a new one and the old one stops working.
 */

import React, { useState, useTransition } from 'react'
import {
  cancelVoSigningRequest,
  rejectVo,
  resendVoSigningLink,
  submitVoForClientSignature,
  submitVoForCommercialPricing,
  type VoSigningLinkResult,
  type VoStatus,
} from '@/app/(dashboard)/projects/[id]/vos/actions'
import { PortalLinkDisplay } from '@/components/canvas-sign/portal-link-display'

interface Props {
  voId: string
  status: VoStatus
  canSubmitForCommercialPricing: boolean
  canSendForClientSignature: boolean
  canReject: boolean
}

export function VoApprovalActions({
  voId,
  status,
  canSubmitForCommercialPricing,
  canSendForClientSignature,
  canReject,
}: Props) {
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [link, setLink] = useState<VoSigningLinkResult | null>(null)
  const [pending, startTransition] = useTransition()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')

  function runPrice() {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const res = await submitVoForCommercialPricing(voId)
      if (res.error) setError(res.error)
      else setInfo('Sent to Commercial for pricing.')
    })
  }

  function runSign(task: () => Promise<VoSigningLinkResult>) {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const res = await task()
      if (res.error) {
        setError(res.error)
        return
      }
      setLink(res.url ? res : null)
      if (!res.url) setInfo('Sent for client signature.')
    })
  }

  function runCancelRequest() {
    if (
      !window.confirm(
        'Cancel this signature request? The current link stops working and the VO goes back to commercial pricing.'
      )
    ) {
      return
    }
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const res = await cancelVoSigningRequest(voId)
      if (res.error) {
        setError(res.error)
        return
      }
      setLink(null)
      setInfo('Signature request cancelled. The VO is back with Commercial.')
    })
  }

  function runReject() {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const res = await rejectVo(voId, reason)
      if (res.error) setError(res.error)
      else {
        setLink(null)
        setInfo('VO rejected.')
        setShowReject(false)
        setReason('')
      }
    })
  }

  const finalised = status === 'signed' || status === 'rejected'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {status === 'draft' && canSubmitForCommercialPricing && (
          <button onClick={runPrice} disabled={pending} style={primaryBtnStyle}>
            {pending ? 'Working…' : 'Submit for commercial pricing'}
          </button>
        )}
        {status === 'pending_commercial_pricing' && canSendForClientSignature && (
          <button
            onClick={() => runSign(() => submitVoForClientSignature(voId))}
            disabled={pending}
            style={primaryBtnStyle}
          >
            {pending ? 'Working…' : 'Send for client signature'}
          </button>
        )}
        {status === 'pending_client_signature' && (
          <span style={waitingChip}>Awaiting client signature</span>
        )}
        {status === 'pending_client_signature' && canSendForClientSignature && (
          <>
            <button
              onClick={() => runSign(() => resendVoSigningLink(voId))}
              disabled={pending}
              style={primaryBtnStyle}
            >
              {pending ? 'Working…' : 'Resend signing link'}
            </button>
            <button onClick={runCancelRequest} disabled={pending} style={secondaryBtnStyle}>
              Cancel request
            </button>
          </>
        )}
        {!finalised && canReject && (
          <button
            onClick={() => setShowReject((v) => !v)}
            disabled={pending}
            style={secondaryBtnStyle}
          >
            {showReject ? 'Close' : 'Reject'}
          </button>
        )}
      </div>

      {status === 'pending_client_signature' && canSendForClientSignature && !link ? (
        <p style={{ margin: 0, color: 'var(--color-neutral-600)', fontSize: 12 }}>
          Each signing link works for 48 hours and is not emailed. If the client did not get it or it
          expired, resend to create a new link; the old one stops working.
        </p>
      ) : null}

      {showReject && !finalised && canReject && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection…"
            style={{
              padding: '6px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <button
            onClick={runReject}
            disabled={pending || reason.trim() === ''}
            style={{ ...secondaryBtnStyle, borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
          >
            Confirm rejection
          </button>
        </div>
      )}

      {link?.url ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-700)' }}>
            Send this link to the client. It is not emailed automatically.
          </p>
          <PortalLinkDisplay url={link.url} expiresAt={link.expiresAt} />
        </div>
      ) : null}

      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--color-danger)', fontSize: 12 }}>
          {error}
        </p>
      )}
      {info && <p style={{ margin: 0, color: 'var(--color-neutral-700)', fontSize: 12 }}>{info}</p>}
    </div>
  )
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--color-navy-700)',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--color-surface)',
  color: 'var(--color-neutral-700)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontWeight: 500,
  fontSize: 13,
  cursor: 'pointer',
}

const waitingChip: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  background: 'var(--color-warning-soft)',
  color: 'var(--color-warning)',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  fontWeight: 600,
}
