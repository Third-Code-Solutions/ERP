'use client'

import React, { useActionState } from 'react'

export interface BomSignState {
  ok?: true
  error?: string
}

export function BomSignButton({
  action,
}: {
  action: (state: BomSignState, formData: FormData) => Promise<BomSignState>
}) {
  const [state, formAction, isPending] = useActionState(action, {})

  if (state.ok) {
    return (
      <p role="status" style={{ margin: 0, fontSize: 14, color: '#0d5c3a', fontWeight: 600 }}>
        Thank you. Your approval is recorded and the BOM is now locked.
      </p>
    )
  }

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        style={{
          background: '#E07B2A',
          color: 'white',
          border: 0,
          padding: '12px 22px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: isPending ? 'progress' : 'pointer',
          opacity: isPending ? 0.7 : 1,
          letterSpacing: '0.01em',
          boxShadow: '0 1px 3px rgba(224, 123, 42, 0.35)',
        }}
      >
        {isPending ? 'Recording approval…' : 'I approve this BOM'}
      </button>
      {state.error && (
        <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: '#a01818' }}>
          {state.error}
        </p>
      )}
    </form>
  )
}
