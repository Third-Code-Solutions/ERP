'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { assignPoLineCostCode } from '@/app/(dashboard)/procurement/actions'

export function CostCodeAssignment({
  lineId,
  currentId,
  editable,
  codes,
}: {
  lineId: string
  currentId: string | null
  editable: boolean
  codes: Array<{ id: string; code: string; name: string }>
}) {
  const router = useRouter()
  const [value, setValue] = useState(currentId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!editable) {
    const current = codes.find((code) => code.id === currentId)
    return current ? (
      <span title={current.name}>{current.code}</span>
    ) : (
      <span className="budget-negative-text">Missing</span>
    )
  }

  return (
    <div>
      <select
        aria-label="Cost Code"
        value={value}
        disabled={pending}
        onChange={(event) => {
          const nextValue = event.target.value
          setValue(nextValue)
          setError(null)
          if (!nextValue) return
          startTransition(async () => {
            const result = await assignPoLineCostCode(lineId, nextValue)
            if (result.error) {
              setError(result.error)
              return
            }
            router.refresh()
          })
        }}
        style={{
          width: '140px',
          padding: '5px 7px',
          border: '1px solid var(--color-border)',
          borderRadius: 5,
          background: 'white',
          fontSize: '0.75rem',
        }}
      >
        <option value="">Select code</option>
        {codes.map((code) => (
          <option value={code.id} key={code.id}>
            {code.code} · {code.name}
          </option>
        ))}
      </select>
      {error && (
        <span
          role="alert"
          title={error}
          style={{ display: 'block', color: 'var(--color-danger)', fontSize: 10 }}
        >
          Not saved
        </span>
      )}
    </div>
  )
}
