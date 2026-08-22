'use client'

import { useState, useTransition } from 'react'
import { escalatePermit, updatePermitStatus } from '@/app/(dashboard)/projects/[id]/permits/actions'

type PermitStatus =
  | 'not_started'
  | 'submitted'
  | 'additional_docs_required'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'released'
  | 'refunded'
  | 'cancelled'

interface UpdatePermitStatusProps {
  permitId: string
  currentStatus: PermitStatus
  isLate?: boolean
  canManage?: boolean
}

const STATUS_LABELS: Record<PermitStatus, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  additional_docs_required: 'Additional docs required',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  released: 'Released',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

const STATUS_ORDER: PermitStatus[] = [
  'not_started',
  'submitted',
  'additional_docs_required',
  'under_review',
  'approved',
  'rejected',
  'released',
  'refunded',
  'cancelled',
]

export function UpdatePermitStatus({
  permitId,
  currentStatus,
  isLate = false,
  canManage = false,
}: UpdatePermitStatusProps) {
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState<PermitStatus>(currentStatus)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [showEscalation, setShowEscalation] = useState(false)

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

  const handleEscalate = () => {
    setError(null)
    startTransition(async () => {
      const result = await escalatePermit(permitId, reason)
      if (result.error) {
        setError(result.error)
        return
      }
      setReason('')
      setShowEscalation(false)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
      <select
        value={value}
        disabled={pending || !canManage}
        onChange={(e) => handleChange(e.target.value as PermitStatus)}
        style={{
          padding: '6px 10px',
          fontSize: '0.8125rem',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          background: 'white',
          cursor: pending || !canManage ? 'not-allowed' : 'pointer',
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
      {canManage && isLate && !showEscalation && !['approved', 'rejected', 'released', 'refunded', 'cancelled'].includes(value) && (
        <button
          type="button"
          onClick={() => setShowEscalation(true)}
          disabled={pending}
          style={{ background: 'transparent', border: 0, color: 'var(--color-danger, #ef4444)', cursor: pending ? 'not-allowed' : 'pointer', fontSize: '0.7rem', padding: '2px 0', textAlign: 'left' }}
        >
          Escalate return
        </button>
      )}
      {showEscalation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <textarea
            aria-label="Escalation reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason and next owner"
            rows={2}
            style={{ border: '1px solid var(--color-border)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '0.72rem', padding: '5px', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" className="btn btn-primary" disabled={pending || reason.trim().length < 3} onClick={handleEscalate}>
              {pending ? 'Saving…' : 'Log escalation'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setShowEscalation(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
