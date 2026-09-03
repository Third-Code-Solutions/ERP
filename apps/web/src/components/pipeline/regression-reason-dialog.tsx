'use client'

import { useEffect, useRef, useState } from 'react'
import { STAGE_REASON_MAX_LENGTH } from './stage-transition-action'

interface RegressionReasonDialogProps {
  open: boolean
  fromLabel: string
  toLabel: string
  isSubmitting?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}

export function RegressionReasonDialog({
  open,
  fromLabel,
  toLabel,
  isSubmitting,
  onCancel,
  onConfirm,
}: RegressionReasonDialogProps) {
  const [reason, setReason] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Reset state every time the dialog reopens so the previous reason is not
  // accidentally carried over to a different opportunity.
  useEffect(() => {
    if (open) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setReason('')
      // Defer focus so the modal has time to mount.
      const t = setTimeout(() => textareaRef.current?.focus(), 0)
      return () => {
        clearTimeout(t)
        previousFocusRef.current?.focus()
      }
    }
  }, [open])

  if (!open) return null

  const trimmed = reason.trim()
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !isSubmitting) {
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="regression-reason-dialog-title"
      aria-describedby="regression-reason-dialog-description"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '20px',
          width: '460px',
          maxWidth: 'calc(100vw - 32px)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
        }}
      >
        <h3 id="regression-reason-dialog-title" style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 600 }}>
          Reason required
        </h3>
        <p id="regression-reason-dialog-description" style={{ margin: '0 0 12px', fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>
          Moving from <strong>{fromLabel}</strong> back to <strong>{toLabel}</strong>{' '}
          is a regression. Please explain why so leadership can review.
        </p>
        <textarea
          ref={textareaRef}
          aria-label="Regression reason"
          required
          maxLength={STAGE_REASON_MAX_LENGTH}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Client requested additional scope changes after BOM submission"
          rows={4}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: '0.875rem',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              color: 'var(--color-neutral-700)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmed)}
            disabled={isSubmitting || trimmed.length === 0}
            style={{
              background: 'var(--color-navy-700)',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: isSubmitting || trimmed.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isSubmitting || trimmed.length === 0 ? 0.6 : 1,
            }}
          >
            {isSubmitting ? 'Saving…' : 'Confirm regression'}
          </button>
        </div>
      </div>
    </div>
  )
}
