'use client'

/**
 * ClaimTransitionActions — right-rail panel that surfaces only the CTA
 * appropriate to the claim's current status. The page owner gates this
 * panel by capability before mounting it; the panel itself stays dumb
 * about role logic and just calls the action.
 *
 * Statuses + actions:
 *   draft               → Submit for commercial review · Cancel
 *   submitted           → Mark certificate pending · Reject
 *   certificate_pending → Record certification (pick cert doc) · Reject
 *   certified           → Handover to Finance · Reject
 *   handed_over_finance → Link invoice (picker) · Reject
 *   invoiced            → Record payment
 *   paid / rejected /   → read-only summary
 *   cancelled
 */

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  submitClaim,
  markCertificatePending,
  recordCertification,
  handoverToFinance,
  linkInvoice,
  recordPayment,
  rejectClaim,
  cancelClaim,
} from '@/app/(dashboard)/claims/[id]/actions'

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'certificate_pending'
  | 'certified'
  | 'handed_over_finance'
  | 'invoiced'
  | 'paid'
  | 'rejected'
  | 'cancelled'

import type { ClaimActionPermissions } from '@/app/(dashboard)/claims/[id]/claim-permissions'

interface DocOption {
  id: string
  file_name: string
}

interface InvoiceOption {
  id: string
  invoice_number: string
  net_amount_cents: number
}

interface ClaimTransitionActionsProps {
  claimId: string
  status: ClaimStatus
  rejectedReason?: string | null
  certificateDocs: DocOption[]
  invoices: InvoiceOption[]
  permissions: ClaimActionPermissions
}

export function ClaimTransitionActions({
  claimId,
  status,
  rejectedReason,
  certificateDocs,
  invoices,
  permissions,
}: ClaimTransitionActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [showCertify, setShowCertify] = useState(false)
  const [certDocId, setCertDocId] = useState('')

  const [showInvoice, setShowInvoice] = useState(false)
  const [invoiceId, setInvoiceId] = useState('')

  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const requestIdsRef = useRef(new Map<string, string>())
  const [retry, setRetry] = useState<(() => void) | null>(null)

  function stableRequestId(key: string): string {
    const existing = requestIdsRef.current.get(key)
    if (existing) return existing
    const id = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : ''
    if (!id) throw new Error('This browser cannot create a safe request identifier')
    requestIdsRef.current.set(key, id)
    return id
  }

  function run(key: string, fn: (clientRequestId: string) => Promise<{ error?: string; outcome?: 'rejected' | 'unknown' }>): void {
    setError(null)
    const retryFn = () => run(key, fn)
    startTransition(async () => {
      let id: string
      try {
        id = stableRequestId(key)
      } catch {
        setError('This browser cannot create a safe request identifier. Refresh or use a current browser.')
        return
      }
      let r: { error?: string; outcome?: 'rejected' | 'unknown' }
      try {
        r = await fn(id)
      } catch {
        setError('The transition outcome is unconfirmed. Keep this page open and retry the unchanged command.')
        setRetry(() => retryFn)
        return
      }
      if (r?.error) {
        setError(r.error)
        setRetry(r.outcome === 'unknown' ? () => retryFn : null)
        return
      }
      // Reset inline forms on success.
      setShowCertify(false)
      setShowInvoice(false)
      setShowReject(false)
      setShowCancel(false)
      setRejectReason('')
      setCancelReason('')
      setCertDocId('')
      setInvoiceId('')
      requestIdsRef.current.delete(key)
      setRetry(null)
      router.refresh()
    })
  }

  const isTerminal =
    status === 'paid' || status === 'rejected' || status === 'cancelled'
  const canAdvance =
    (status === 'draft' && permissions.submit) ||
    ((status === 'submitted' || status === 'certificate_pending' || status === 'certified') &&
      permissions.commercial) ||
    ((status === 'handed_over_finance' || status === 'invoiced') && permissions.finance)
  const hasNoActions = !isTerminal && !canAdvance && !permissions.rejectOrCancel

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Actions
      </h3>

      {/* Per-status primary CTAs */}
      {hasNoActions && (
        <p style={hintStyle}>
          Nothing for your role to do at this stage. The claim moves on when the
          responsible team acts.
        </p>
      )}

      {status === 'draft' && (
        <>
          {permissions.submit && (
            <button
              type="button"
              className="claim-action claim-action-primary"
              onClick={() => run('submit', (id) => submitClaim(claimId, id))}
              disabled={isPending}
            >
              Submit for commercial review
            </button>
          )}
          {!permissions.rejectOrCancel ? null : !showCancel ? (
            <button
              type="button"
              className="claim-action claim-action-danger-outline"
              onClick={() => setShowCancel(true)}
              disabled={isPending}
            >
              Cancel claim
            </button>
          ) : (
            <CancelInline
              reason={cancelReason}
              setReason={setCancelReason}
              onConfirm={() => run(`cancel:${cancelReason.trim()}`, (id) => cancelClaim(claimId, cancelReason, id))}
              onAbort={() => {
                setShowCancel(false)
                setCancelReason('')
              }}
              isPending={isPending}
            />
          )}
        </>
      )}

      {status === 'submitted' && permissions.commercial && (
        <button
          type="button"
          className="claim-action claim-action-primary"
          onClick={() => run('certificate_pending', (id) => markCertificatePending(claimId, id))}
          disabled={isPending}
        >
          Mark certificate pending
        </button>
      )}

      {(status === 'submitted' || status === 'certificate_pending') &&
        permissions.commercial &&
        (showCertify ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Certificate document</label>
            <select
              value={certDocId}
              onChange={(e) => setCertDocId(e.target.value)}
              style={inputStyle}
              disabled={isPending}
            >
              <option value="">Select uploaded document…</option>
              {certificateDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.file_name}
                </option>
              ))}
            </select>
            {certificateDocs.length === 0 && (
              <p style={hintStyle}>
                Attach the certificate as a project document first, then return
                here.
              </p>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="claim-action claim-action-primary"
                onClick={() => {
                  if (!certDocId) {
                    setError('Pick the certification document')
                    return
                  }
                  run(`certify:${certDocId}`, (id) => recordCertification(claimId, certDocId, id))
                }}
                disabled={isPending || !certDocId}
                style={{ flex: 1 }}
              >
                Record certification
              </button>
              <button
                type="button"
                className="claim-action"
                onClick={() => setShowCertify(false)}
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="claim-action"
            onClick={() => setShowCertify(true)}
            disabled={isPending}
          >
            Record certification…
          </button>
        ))}

      {status === 'certified' && permissions.commercial && (
        <button
          type="button"
          className="claim-action claim-action-primary"
          onClick={() => run('handover', (id) => handoverToFinance(claimId, id))}
          disabled={isPending}
        >
          Handover to Finance
        </button>
      )}

      {status === 'handed_over_finance' &&
        permissions.finance &&
        (showInvoice ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Invoice</label>
            <select
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              style={inputStyle}
              disabled={isPending}
            >
              <option value="">Select an invoice from this project…</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} · ₱
                  {(inv.net_amount_cents / 100).toLocaleString('en-PH')}
                </option>
              ))}
            </select>
            {invoices.length === 0 && (
              <p style={hintStyle}>
                No invoices exist for this project yet. Create one under
                Invoices first.
              </p>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="claim-action claim-action-primary"
                onClick={() => {
                  if (!invoiceId) {
                    setError('Pick an invoice to link')
                    return
                  }
                  run(`link_invoice:${invoiceId}`, (id) => linkInvoice(claimId, invoiceId, id))
                }}
                disabled={isPending || !invoiceId}
                style={{ flex: 1 }}
              >
                Link invoice
              </button>
              <button
                type="button"
                className="claim-action"
                onClick={() => setShowInvoice(false)}
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="claim-action claim-action-primary"
            onClick={() => setShowInvoice(true)}
            disabled={isPending}
          >
            Link invoice…
          </button>
        ))}

      {status === 'invoiced' && permissions.finance && (
        <button
          type="button"
          className="claim-action claim-action-success"
          onClick={() => run('record_payment', (id) => recordPayment(claimId, id))}
          disabled={isPending}
        >
          Record payment
        </button>
      )}

      {/* Reject is available on every non-terminal status */}
      {!isTerminal &&
        permissions.rejectOrCancel &&
        (showReject ? (
          <RejectInline
            reason={rejectReason}
            setReason={setRejectReason}
            onConfirm={() => {
              if (rejectReason.trim().length < 3) {
                setError('Reason must be at least 3 characters')
                return
              }
              run(`reject:${rejectReason.trim()}`, (id) => rejectClaim(claimId, rejectReason, id))
            }}
            onAbort={() => {
              setShowReject(false)
              setRejectReason('')
            }}
            isPending={isPending}
          />
        ) : (
          <button
            type="button"
            className="claim-action claim-action-danger-outline"
            onClick={() => setShowReject(true)}
            disabled={isPending}
          >
            Reject claim
          </button>
        ))}

      {/* Terminal-state summaries */}
      {status === 'paid' && (
        <div
          style={{
            background: '#ecfdf5',
            color: '#166534',
            padding: '8px 10px',
            borderRadius: 6,
            fontSize: 12.5,
          }}
        >
          Claim has been paid. No further actions available.
        </div>
      )}
      {status === 'rejected' && (
        <div
          style={{
            background: '#fef3f2',
            color: '#8a2222',
            padding: '8px 10px',
            borderRadius: 6,
            fontSize: 12.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Claim rejected</div>
          <div>{rejectedReason || '(no reason recorded)'}</div>
        </div>
      )}
      {status === 'cancelled' && (
        <div
          style={{
            background: 'var(--color-neutral-50)',
            color: 'var(--color-neutral-600)',
            padding: '8px 10px',
            borderRadius: 6,
            fontSize: 12.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Claim cancelled</div>
          <div>{rejectedReason || '(no reason recorded)'}</div>
        </div>
      )}

      {retry && (
        <button
          type="button"
          className="claim-action"
          onClick={retry}
          disabled={isPending}
        >
          {isPending ? 'Retrying…' : 'Retry unchanged command'}
        </button>
      )}

      {error && (
        <div
          style={{
            background: '#fef3f2',
            color: '#b42318',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}

      <style>{`
        .claim-action {
          background: var(--color-surface);
          border: 1px solid #d0d5dd;
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          color: #14213d;
          width: 100%;
          text-align: left;
        }
        .claim-action:hover:not(:disabled) { background: #f5f6f8; }
        .claim-action:disabled { opacity: 0.55; cursor: not-allowed; }
        .claim-action-primary {
          background: #0F2D4A;
          color: white;
          border-color: #0F2D4A;
        }
        .claim-action-primary:hover:not(:disabled) { background: #11375a; }
        .claim-action-success {
          background: #15803d;
          color: white;
          border-color: #15803d;
        }
        .claim-action-success:hover:not(:disabled) { background: #166f37; }
        .claim-action-danger-outline {
          background: var(--color-surface);
          color: #b42318;
          border-color: #f4b4b4;
        }
        .claim-action-danger-outline:hover:not(:disabled) { background: #fef3f2; }
      `}</style>
    </div>
  )
}

interface InlineReasonProps {
  reason: string
  setReason: (v: string) => void
  onConfirm: () => void
  onAbort: () => void
  isPending: boolean
}

function RejectInline({ reason, setReason, onConfirm, onAbort, isPending }: InlineReasonProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={labelStyle}>Reason for rejection *</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={2000}
        disabled={isPending}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        placeholder="Explain why this claim is being rejected…"
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="claim-action claim-action-danger-outline"
          onClick={onConfirm}
          disabled={isPending || reason.trim().length < 3}
          style={{ flex: 1 }}
        >
          Confirm rejection
        </button>
        <button
          type="button"
          className="claim-action"
          onClick={onAbort}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function CancelInline({ reason, setReason, onConfirm, onAbort, isPending }: InlineReasonProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={labelStyle}>Reason for cancellation *</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={2000}
        disabled={isPending}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        placeholder="Why are you cancelling this draft?"
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="claim-action claim-action-danger-outline"
          onClick={onConfirm}
          disabled={isPending || reason.trim().length < 3}
          style={{ flex: 1 }}
        >
          Confirm cancel
        </button>
        <button
          type="button"
          className="claim-action"
          onClick={onAbort}
          disabled={isPending}
        >
          Keep draft
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  background: 'var(--color-surface)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-600)',
  fontWeight: 500,
}

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-neutral-600)',
  margin: 0,
}
