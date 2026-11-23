'use client'

import React, { useState, useTransition } from 'react'
import { recordSign } from './sign-actions'

interface SignOutcome {
  signed: boolean
  message: string
}

/**
 * The client's approve button. Shows what happened instead of dropping the
 * result: a refusal says why, and success says the BOM is now locked.
 */
export function PortalSignForm({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<SignOutcome | null>(null)

  function handleSign() {
    setOutcome(null)
    startTransition(async () => {
      const result = await recordSign(token)
      if (result.ok) {
        setOutcome({
          signed: true,
          message: result.warning
            ? `Thank you. Your approval is recorded and the BOM is now locked. ${result.warning}`
            : 'Thank you. Your approval is recorded and the BOM is now locked for execution.',
        })
        return
      }
      setOutcome({
        signed: false,
        message:
          result.error ??
          'We could not record your approval. Please try again, or contact your project team.',
      })
    })
  }

  if (outcome?.signed) {
    return (
      <p
        role="status"
        style={{
          margin: 0,
          padding: '14px 16px',
          border: '1px solid #b7dfc4',
          borderRadius: 8,
          background: '#f0faf3',
          color: '#1d5c33',
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        {outcome.message}
      </p>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSign}
        disabled={isPending}
        style={{
          background: '#E07B2A',
          color: 'white',
          border: 0,
          padding: '12px 22px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: isPending ? 'wait' : 'pointer',
          letterSpacing: '0.01em',
          boxShadow: '0 1px 3px rgba(224, 123, 42, 0.35)',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Recording your approval…' : 'I approve this BOM'}
      </button>
      {outcome ? (
        <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: '#b3261e', lineHeight: 1.5 }}>
          {outcome.message}
        </p>
      ) : null}
    </div>
  )
}
