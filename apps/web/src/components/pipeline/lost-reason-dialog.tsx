'use client'

import { useEffect, useRef, useState } from 'react'
import { STAGE_REASON_MAX_LENGTH } from './stage-transition-action'

interface LostReasonDialogProps {
  open: boolean
  isSubmitting?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}

export function LostReasonDialog({
  open,
  isSubmitting,
  onCancel,
  onConfirm,
}: LostReasonDialogProps) {
  const [reason, setReason] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setReason('')
      const timer = setTimeout(() => textareaRef.current?.focus(), 0)
      return () => {
        clearTimeout(timer)
        previousFocusRef.current?.focus()
      }
    }
  }, [open])

  if (!open) return null

  const trimmed = reason.trim()
  const confirmDisabled = Boolean(isSubmitting) || trimmed.length === 0
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
      aria-labelledby="lost-reason-dialog-title"
      aria-describedby="lost-reason-dialog-description"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      style={backdropStyle}
    >
      <div onClick={(event) => event.stopPropagation()} style={dialogStyle}>
        <h3 id="lost-reason-dialog-title" style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 600 }}>
          Lost reason required
        </h3>
        <p
          id="lost-reason-dialog-description"
          style={{
            margin: '0 0 12px',
            fontSize: '0.8125rem',
            color: 'var(--color-neutral-500)',
          }}
        >
          Explain why this opportunity was lost. This reason is required before
          the stage can change.
        </p>
        <textarea
          ref={textareaRef}
          aria-label="Lost reason"
          required
          maxLength={STAGE_REASON_MAX_LENGTH}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Lost on price; client selected another contractor"
          rows={4}
          style={textareaStyle}
        />
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
            marginTop: '12px',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            style={cancelButtonStyle}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmed)}
            disabled={confirmDisabled}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: confirmDisabled ? 'not-allowed' : 'pointer',
              opacity: confirmDisabled ? 0.6 : 1,
            }}
          >
            {isSubmitting ? 'Saving…' : 'Mark as Lost'}
          </button>
        </div>
      </div>
    </div>
  )
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
}

const dialogStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '8px',
  padding: '20px',
  width: '460px',
  maxWidth: 'calc(100vw - 32px)',
  boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '0.875rem',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  resize: 'vertical',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const cancelButtonStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid var(--color-border)',
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '0.8125rem',
  cursor: 'pointer',
  color: 'var(--color-neutral-700)',
}
