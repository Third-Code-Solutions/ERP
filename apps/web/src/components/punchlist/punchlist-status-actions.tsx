'use client'

// Status-transition + PE sign-off panel on the punchlist detail page.
// The detail page passes in only what's needed — current status, sign-off
// state, and whether the viewer is allowed to sign — so this component
// stays dumb about role logic.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updatePunchlistStatus,
  signOffPunchlistItem,
} from '@/app/(dashboard)/punchlist/actions'

type PunchlistStatus = 'open' | 'in_progress' | 'for_inspection' | 'closed'

interface Props {
  itemId: string
  currentStatus: PunchlistStatus
  isSignedOff: boolean
  canSignOff: boolean
}

const NEXT_STATUS: Record<PunchlistStatus, PunchlistStatus[]> = {
  open: ['in_progress', 'for_inspection'],
  in_progress: ['open', 'for_inspection'],
  for_inspection: ['in_progress', 'closed'],
  closed: [],
}

const LABELS: Record<PunchlistStatus, string> = {
  open: 'Reopen',
  in_progress: 'Mark in progress',
  for_inspection: 'Mark for inspection',
  closed: 'Close item',
}

export function PunchlistStatusActions({
  itemId,
  currentStatus,
  isSignedOff,
  canSignOff,
}: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function doTransition(next: PunchlistStatus) {
    setError('')
    startTransition(async () => {
      const res = await updatePunchlistStatus(itemId, next)
      if (res?.error) {
        // Translate the special "requires_pe_signoff" error into copy a
        // human can act on without consulting the spec.
        if (res.error === 'requires_pe_signoff') {
          setError(
            'PE sign-off required before closing. Move to "for inspection" and have a PE stamp it.'
          )
        } else {
          setError(res.error)
        }
      } else {
        router.refresh()
      }
    })
  }

  function doSignOff() {
    setError('')
    startTransition(async () => {
      const res = await signOffPunchlistItem(itemId)
      if (res?.error) setError(res.error)
      else router.refresh()
    })
  }

  const transitions = NEXT_STATUS[currentStatus]
  // Sign-off is offered when status is for_inspection (so the same click
  // closes it) OR if for some reason status='closed' but no sign-off yet
  // (data drift / migration backfill safety net).
  const showSignOff =
    canSignOff && !isSignedOff && (currentStatus === 'for_inspection' || currentStatus === 'closed')

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
        Status actions
      </h3>

      {transitions.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>
          This item is closed. No further transitions available.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {transitions.map((next) => {
            const isClose = next === 'closed'
            const blocked = isClose && !isSignedOff
            return (
              <button
                key={next}
                onClick={() => doTransition(next)}
                disabled={isPending || blocked}
                title={blocked ? 'Requires PE sign-off' : undefined}
                style={{
                  border: '1px solid var(--color-border)',
                  background: blocked ? 'var(--color-neutral-50)' : 'white',
                  color: blocked ? 'var(--color-neutral-400)' : 'var(--color-neutral-800)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: blocked || isPending ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                }}
              >
                {LABELS[next]}
                {blocked ? ' (requires PE sign-off)' : ''}
              </button>
            )
          })}
        </div>
      )}

      {showSignOff ? (
        <button
          onClick={doSignOff}
          disabled={isPending}
          style={{
            background: 'var(--color-success, #15803d)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          {currentStatus === 'for_inspection'
            ? 'PE sign-off & close'
            : 'PE sign-off'}
        </button>
      ) : null}

      {isSignedOff ? (
        <p
          style={{
            margin: 0,
            fontSize: '0.75rem',
            color: 'var(--color-success, #166534)',
            background: '#dcfce7',
            padding: '8px 10px',
            borderRadius: 6,
          }}
        >
          PE signed off.
        </p>
      ) : null}

      {!canSignOff && !isSignedOff && currentStatus === 'for_inspection' ? (
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-neutral-500)' }}>
          Awaiting PE sign-off from SD/PM/PE.
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
