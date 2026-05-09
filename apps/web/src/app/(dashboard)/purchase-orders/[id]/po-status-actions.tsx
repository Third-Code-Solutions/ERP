'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { advancePoStatus } from '@/app/(dashboard)/procurement/actions'

const VALID_TRANSITIONS: Record<string, { label: string; status: string; variant: 'primary' | 'danger' }[]> = {
  draft: [{ label: 'Submit PO', status: 'submitted', variant: 'primary' }, { label: 'Cancel', status: 'cancelled', variant: 'danger' }],
  submitted: [{ label: 'Confirm PO', status: 'confirmed', variant: 'primary' }, { label: 'Cancel', status: 'cancelled', variant: 'danger' }],
  confirmed: [
    { label: 'Mark Partial Delivery', status: 'partial_delivery', variant: 'primary' },
    { label: 'Mark Delivered', status: 'delivered', variant: 'primary' },
    { label: 'Cancel', status: 'cancelled', variant: 'danger' },
  ],
  partial_delivery: [{ label: 'Mark Delivered', status: 'delivered', variant: 'primary' }, { label: 'Cancel', status: 'cancelled', variant: 'danger' }],
  delivered: [],
  cancelled: [],
}

interface Props {
  poId: string
  currentStatus: string
}

export function PoStatusActions({ poId, currentStatus }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const transitions = VALID_TRANSITIONS[currentStatus] ?? []

  if (transitions.length === 0) return null

  function handleTransition(nextStatus: string) {
    startTransition(async () => {
      const result = await advancePoStatus(poId, nextStatus)
      if ('error' in result) {
        alert(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {transitions.map(({ label, status, variant }) => (
        <button
          key={status}
          disabled={pending}
          onClick={() => handleTransition(status)}
          style={{
            padding: '7px 14px',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
            border: 'none',
            background: variant === 'danger' ? '#fee2e2' : 'var(--color-navy-700)',
            color: variant === 'danger' ? '#dc2626' : 'white',
          }}
        >
          {pending ? '…' : label}
        </button>
      ))}
    </div>
  )
}
