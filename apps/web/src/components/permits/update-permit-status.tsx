'use client'

import { useState, useTransition } from 'react'
import { updatePermitStatus } from '@/app/(dashboard)/projects/[id]/permits/actions'

type PermitStatus =
  | 'not_started'
  | 'submitted'
  | 'additional_docs_required'
  | 'under_review'
  | 'approved'
  | 'rejected'

interface UpdatePermitStatusProps {
  permitId: string
  currentStatus: PermitStatus
}

const STATUS_LABELS: Record<PermitStatus, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  additional_docs_required: 'Additional docs required',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
}

const STATUS_ORDER: PermitStatus[] = [
  'not_started',
  'submitted',
  'additional_docs_required',
  'under_review',
  'approved',
  'rejected',
]

export function UpdatePermitStatus({ permitId, currentStatus }: UpdatePermitStatusProps) {
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState<PermitStatus>(currentStatus)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (next: PermitStatus) => {
    if (next === value) return
    const previous = value
    setValue(next)
    setError(null)
    startTransition(async () => {
      const result = await updatePermitStatus(permitId, next)
      if (result.error) {
        setError(result.error)
        setValue(previous)
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value as PermitStatus)}
        style={{
          padding: '6px 10px',
          fontSize: '0.8125rem',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          background: 'white',
          cursor: pending ? 'progress' : 'pointer',
        }}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {error && (
        <span style={{ fontSize: '0.6875rem', color: 'var(--color-danger, #ef4444)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
