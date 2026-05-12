'use client'

// US-011 #4 — Captures the reason for any quantity/price override on a BOM
// line so the audit trail tells WHY the estimator deviated from the suggested
// or previous value. Mirrors the dialog UX from `kyc-review-form.tsx`:
// local `useState` for fields, `useTransition` for the server round-trip,
// inline error display, escape/backdrop dismiss.

import { useEffect, useRef, useState, useTransition } from 'react'
import { recordOverrideJustification } from '@/app/(dashboard)/projects/[id]/bom/actions'

const MAX_REASON_LENGTH = 200 // US-011 #4

interface JustificationDialogProps {
  lineItemId: string
  projectId: string
  fieldChanged: string
  before: unknown
  after: unknown
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

export function JustificationDialog({
  lineItemId,
  projectId,
  fieldChanged,
  before,
  after,
  open,
  onClose,
  onSaved,
}: JustificationDialogProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Reset whenever the dialog opens for a new override.
  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
      // Focus the textarea on next paint so keyboard users land immediately.
      const t = setTimeout(() => textareaRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pending, onClose])

  if (!open) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('A reason is required to record the override.')
      return
    }
    if (trimmed.length > MAX_REASON_LENGTH) {
      setError(`Reason must be ${MAX_REASON_LENGTH} characters or fewer.`)
      return
    }
    startTransition(async () => {
      const res = await recordOverrideJustification(
        lineItemId,
        projectId,
        fieldChanged,
        trimmed,
        before,
        after,
      )
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      onSaved?.()
      onClose()
    })
  }

  const remaining = MAX_REASON_LENGTH - reason.length
  const nearLimit = remaining <= 20

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="justification-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'white',
          borderRadius: 8,
          padding: 20,
          width: 'min(480px, 100%)',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div>
          <h2
            id="justification-dialog-title"
            style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-neutral-900)', margin: 0 }}
          >
            Justify override
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)', margin: '4px 0 0' }}>
            Field <strong>{fieldChanged}</strong> changed from{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatValue(before)}</span> to{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatValue(after)}</span>.
          </p>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-neutral-500)',
            }}
          >
            Reason *
          </span>
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REASON_LENGTH}
            rows={4}
            placeholder="Vendor quote came in higher than RAG suggestion; client confirmed scope."
            style={{
              fontFamily: 'inherit',
              fontSize: 13,
              padding: 8,
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              resize: 'vertical',
            }}
            disabled={pending}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--color-neutral-400)' }}>Max {MAX_REASON_LENGTH} characters.</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: nearLimit ? 'var(--color-warning)' : 'var(--color-neutral-400)',
              }}
            >
              {remaining}
            </span>
          </div>
        </label>

        {error && (
          <p role="alert" style={{ color: 'var(--color-danger, #ef4444)', fontSize: 12, margin: 0 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              padding: '6px 12px',
              fontSize: '0.8rem',
              cursor: pending ? 'not-allowed' : 'pointer',
              color: 'var(--color-neutral-600)',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            style={{
              background: 'var(--color-navy-700)',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: pending ? 'wait' : 'pointer',
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? 'Saving…' : 'Save justification'}
          </button>
        </div>
      </form>
    </div>
  )
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'number') return v.toLocaleString()
  if (typeof v === 'string') return v || '∅'
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
