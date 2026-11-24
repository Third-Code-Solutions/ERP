'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelRfq, completeRfq } from '@/app/(dashboard)/procurement/rfqs/actions'

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  background: 'var(--color-surface)',
}

/** Complete or cancel an RFQ. A refusal (for example incomplete quote coverage) is shown, not dropped. */
export function RfqTerminalActions({
  rfqId,
  canComplete,
}: {
  rfqId: string
  canComplete: boolean
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(command: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await command()
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        disabled={!canComplete || pending}
        onClick={() => run(() => completeRfq(rfqId))}
        style={{
          background: canComplete ? '#0F2D4A' : '#cbd5e1',
          color: 'white',
          border: 'none',
          padding: '9px 14px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: canComplete && !pending ? 'pointer' : 'not-allowed',
          width: '100%',
        }}
      >
        {pending ? 'Working...' : 'Complete RFQ'}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          aria-label="Cancellation reason"
          placeholder="Cancellation reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          style={inputStyle}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!reason.trim()) {
              setError('Enter a cancellation reason.')
              return
            }
            run(() => cancelRfq(rfqId, reason))
          }}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid #d0d5dd',
            padding: '8px 14px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: pending ? 'not-allowed' : 'pointer',
            color: '#b42318',
          }}
        >
          Cancel RFQ
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: '#b42318', fontSize: 12.5, margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  )
}
