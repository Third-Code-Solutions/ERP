'use client'

/**
 * Approval CTAs rendered on the VO detail page.
 *
 * Which buttons render depends on the VO's current status:
 *   draft                       → Submit for commercial pricing | Reject
 *   pending_commercial_pricing  → Send for client signature     | Reject
 *   pending_client_signature    → (passively wait for webhook)  | Reject
 *   signed / rejected           → no actions
 */

import { useState, useTransition } from 'react'
import {
  rejectVo,
  submitVoForClientSignature,
  submitVoForCommercialPricing,
  type VoStatus,
} from '@/app/(dashboard)/projects/[id]/vos/actions'

interface Props {
  voId: string
  status: VoStatus
  docusealSubmissionId: string | null
  canSubmitForCommercialPricing: boolean
  canSendForClientSignature: boolean
  canReject: boolean
}

export function VoApprovalActions({
  voId,
  status,
  docusealSubmissionId,
  canSubmitForCommercialPricing,
  canSendForClientSignature,
  canReject,
}: Props) {
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
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

  function runSign() {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const res = await submitVoForClientSignature(voId)
      if (res.error) setError(res.error)
      else setInfo(res.url ? `DocuSeal submission created: ${res.url}` : 'Sent for client signature.')
    })
  }

  function runReject() {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const res = await rejectVo(voId, reason)
      if (res.error) setError(res.error)
      else {
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
          <button onClick={runSign} disabled={pending} style={primaryBtnStyle}>
            {pending ? 'Working…' : 'Send for client signature'}
          </button>
        )}
        {status === 'pending_client_signature' && (
          <span style={waitingChip}>
            Awaiting DocuSeal signature{docusealSubmissionId ? ` · ${docusealSubmissionId.slice(0, 12)}…` : ''}
          </span>
        )}
        {!finalised && canReject && (
          <button
            onClick={() => setShowReject((v) => !v)}
            disabled={pending}
            style={secondaryBtnStyle}
          >
            {showReject ? 'Cancel' : 'Reject'}
          </button>
        )}
      </div>

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

      {error && <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
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
  background: 'white',
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
