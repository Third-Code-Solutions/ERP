'use client'

import { useState, useTransition } from 'react'
import { receivePoLineItem } from '@/app/(dashboard)/procurement/actions'

interface ReceiveLineFormProps {
  lineId: string
  quantity: number
  receivedQty: number
  disabled?: boolean
}

export function ReceiveLineForm({ lineId, quantity, receivedQty, disabled = false }: ReceiveLineFormProps) {
  const [value, setValue] = useState<string>(String(receivedQty))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const fullyReceived = receivedQty >= quantity

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 0) {
      setError('Must be a non-negative integer')
      return
    }
    if (parsed > quantity) {
      setError(`Max ${quantity}`)
      return
    }

    const formData = new FormData()
    formData.set('line_id', lineId)
    formData.set('received_qty', String(parsed))

    startTransition(async () => {
      const result = await receivePoLineItem(formData)
      if (result.error) {
        setError(result.error)
      }
    })
  }

  if (fullyReceived) {
    return (
      <span style={{ color: 'var(--color-green-700, #047857)', fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
        ✓ fully received
      </span>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
      <input
        type="number"
        min={0}
        max={quantity}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled || isPending}
        aria-label="Mark received qty"
        style={{
          width: '64px',
          padding: '4px 6px',
          fontSize: '0.8125rem',
          fontFamily: 'JetBrains Mono, monospace',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          textAlign: 'right',
          background: disabled ? 'var(--color-neutral-50)' : 'white',
        }}
      />
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-400)', fontFamily: 'JetBrains Mono, monospace' }}>
        / {quantity}
      </span>
      <button
        type="submit"
        disabled={disabled || isPending || value === String(receivedQty)}
        style={{
          padding: '4px 10px',
          fontSize: '0.75rem',
          fontWeight: 600,
          borderRadius: '4px',
          border: '1px solid var(--color-navy-700, #1F3864)',
          background: disabled || isPending || value === String(receivedQty) ? 'var(--color-neutral-100)' : 'var(--color-navy-700, #1F3864)',
          color: disabled || isPending || value === String(receivedQty) ? 'var(--color-neutral-400)' : 'white',
          cursor: disabled || isPending || value === String(receivedQty) ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending ? '...' : 'Save'}
      </button>
      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-red-700, #b91c1c)', marginLeft: '6px' }}>
          {error}
        </span>
      )}
    </form>
  )
}
