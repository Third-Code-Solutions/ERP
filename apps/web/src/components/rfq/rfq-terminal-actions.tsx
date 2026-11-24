'use client'

import React, { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelRfq, completeRfq } from '@/app/(dashboard)/procurement/rfqs/actions'
import { cancelReasonError, rfqCommandError } from '@/lib/procurement/rfq-terminal-command'

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  background: 'var(--color-surface)',
}

type RfqCommand = 'complete' | 'cancel'

/** Complete or cancel an RFQ. A refusal (for example incomplete quote coverage) is shown, not dropped. */
export function RfqTerminalActions({
  rfqId,
  canComplete,
}: {
  rfqId: string
  canComplete: boolean
}) {
  const router = useRouter()
  const errorId = useId()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reasonInvalid, setReasonInvalid] = useState(false)
  const [running, setRunning] = useState<RfqCommand | null>(null)
  const [pending, startTransition] = useTransition()
  const busy = pending ? running : null
  // A cancel refusal is about the reason field, so the field points at it.
  const describesReason = error !== null && (reasonInvalid || running === 'cancel')

  function run(command: RfqCommand, call: () => Promise<{ error?: string }>) {
    setError(null)
    setReasonInvalid(false)
    setRunning(command)
    startTransition(async () => {
      const message = await rfqCommandError(call)
      if (message) {
        setError(message)
        return
      }
      router.refresh()
    })
  }

  function cancel() {
    const invalid = cancelReasonError(reason)
    if (invalid) {
      setError(invalid)
      setReasonInvalid(true)
      return
    }
    run('cancel', () => cancelRfq(rfqId, reason))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        disabled={!canComplete || pending}
        onClick={() => run('complete', () => completeRfq(rfqId))}
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
        {busy === 'complete' ? 'Working...' : 'Complete RFQ'}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          aria-label="Cancellation reason"
          aria-invalid={reasonInvalid || undefined}
          aria-describedby={describesReason ? errorId : undefined}
          placeholder="Cancellation reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          style={inputStyle}
        />
        <button
          type="button"
          disabled={pending}
          onClick={cancel}
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
          {busy === 'cancel' ? 'Working...' : 'Cancel RFQ'}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" style={{ color: '#b42318', fontSize: 12.5, margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  )
}
