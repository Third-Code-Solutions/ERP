'use client'

// Right-rail status panel for the delivery detail page. The state-machine
// buttons (mark preparing, mark in transit, etc.) live in the inline
// site-prep / inspection panels — this rail is reserved for the cross-
// cutting "cancel" action so users always have a single escape hatch.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelDelivery } from '@/app/(dashboard)/procurement/deliveries/actions'

type DeliveryStatus =
  | 'scheduled'
  | 'site_preparing'
  | 'site_ready'
  | 'in_transit'
  | 'received'
  | 'inspecting'
  | 'accepted'
  | 'rejected'
  | 'cancelled'

interface Props {
  scheduleId: string
  status: DeliveryStatus
}

const TERMINAL: ReadonlySet<DeliveryStatus> = new Set([
  'accepted',
  'rejected',
  'cancelled',
])

const NEXT_HINT: Record<DeliveryStatus, string> = {
  scheduled: 'Site prep has not started.',
  site_preparing: 'Site is being prepared.',
  site_ready: 'Site is ready; waiting on supplier dispatch.',
  in_transit: 'Shipment is en route.',
  received: 'Goods are on site; inspection pending.',
  inspecting: 'Inspection in progress.',
  accepted: 'Delivery accepted.',
  rejected: 'Delivery rejected.',
  cancelled: 'Delivery cancelled.',
}

export function DeliveryStatusActions({ scheduleId, status }: Props) {
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function doCancel() {
    setError('')
    if (!reason.trim()) {
      setError('Cancellation reason is required.')
      return
    }
    startTransition(async () => {
      const res = await cancelDelivery(scheduleId, reason.trim())
      if (res?.error) setError(res.error)
      else {
        setShowCancel(false)
        router.refresh()
      }
    })
  }

  const isTerminal = TERMINAL.has(status)

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
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
        Status
      </h3>

      <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-neutral-700)' }}>
        {NEXT_HINT[status]}
      </p>

      {!isTerminal && !showCancel ? (
        <button
          type="button"
          onClick={() => setShowCancel(true)}
          style={{
            border: '1px solid var(--color-border)',
            background: 'white',
            color: 'var(--color-danger)',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Cancel delivery
        </button>
      ) : null}

      {showCancel && !isTerminal ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'var(--color-neutral-600)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Reason
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why is this delivery being cancelled?"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '0.8125rem',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={doCancel}
              disabled={isPending}
              style={{
                background: 'var(--color-danger)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: isPending ? 'wait' : 'pointer',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Cancelling…' : 'Confirm cancellation'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCancel(false)
                setReason('')
                setError('')
              }}
              disabled={isPending}
              style={{
                background: 'white',
                color: 'var(--color-neutral-700)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Keep delivery
            </button>
          </div>
        </div>
      ) : null}

      {isTerminal ? (
        <p
          style={{
            margin: 0,
            fontSize: '0.75rem',
            color: 'var(--color-neutral-500)',
          }}
        >
          This delivery is in a terminal state. No further transitions are
          available.
        </p>
      ) : null}

      {error ? (
        <div
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '8px 10px',
            borderRadius: 6,
            fontSize: '0.75rem',
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  )
}
