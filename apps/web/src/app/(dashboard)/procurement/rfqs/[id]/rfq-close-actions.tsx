'use client'

import React, { useActionState } from 'react'

import { cancelRfq, completeRfq } from '../actions'

type CloseState = { error?: string }

const errorStyle = { margin: '6px 0 0', fontSize: 12.5, color: '#b42318' } as const

export function CompleteRfqButton({ rfqId, enabled }: { rfqId: string; enabled: boolean }) {
  const [state, action, isPending] = useActionState<CloseState>(() => completeRfq(rfqId), {})
  const isActive = enabled && !isPending
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={!isActive}
        aria-busy={isPending}
        style={{
          background: isActive ? '#0F2D4A' : '#cbd5e1',
          color: 'white',
          border: 'none',
          padding: '9px 14px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: isActive ? 'pointer' : 'not-allowed',
          width: '100%',
        }}
      >
        {isPending ? 'Completing…' : 'Complete RFQ'}
      </button>
      {state.error && (
        <p role="alert" style={errorStyle}>
          {state.error}
        </p>
      )}
    </form>
  )
}

export function CancelRfqForm({ rfqId }: { rfqId: string }) {
  const [state, action, isPending] = useActionState<CloseState, FormData>(
    (_prev, formData) => cancelRfq(rfqId, String(formData.get('reason') ?? '')),
    {},
  )
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor="rfq-cancel-reason" className="sr-only">
        Cancellation reason
      </label>
      <input
        id="rfq-cancel-reason"
        name="reason"
        placeholder="Cancellation reason"
        required
        disabled={isPending}
        style={{
          width: '100%',
          border: '1px solid #d0d5dd',
          borderRadius: 6,
          padding: '7px 10px',
          fontSize: 13,
          background: 'var(--color-surface)',
        }}
      />
      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid #d0d5dd',
          padding: '8px 14px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: isPending ? 'progress' : 'pointer',
          color: '#b42318',
        }}
      >
        {isPending ? 'Cancelling…' : 'Cancel RFQ'}
      </button>
      {state.error && (
        <p role="alert" style={errorStyle}>
          {state.error}
        </p>
      )}
    </form>
  )
}
