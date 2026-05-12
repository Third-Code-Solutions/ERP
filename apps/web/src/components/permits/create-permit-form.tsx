'use client'

import { useState, useTransition } from 'react'
import { createPermit } from '@/app/(dashboard)/projects/[id]/permits/actions'

interface CreatePermitFormProps {
  projectId: string
}

const PERMIT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'building_admin_vetting', label: 'Building Admin Vetting' },
  { value: 'lgu_building_permit', label: 'LGU Building Permit' },
  { value: 'dole_permit', label: 'DOLE Permit' },
]

export function CreatePermitForm({ projectId }: CreatePermitFormProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [permitType, setPermitType] = useState(PERMIT_TYPES[0]!.value)
  const [submittedAt, setSubmittedAt] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')

  const reset = () => {
    setError(null)
    setPermitType(PERMIT_TYPES[0]!.value)
    setSubmittedAt('')
    setExpectedAt('')
    setNotes('')
  }

  const submit = () => {
    const fd = new FormData()
    fd.set('project_id', projectId)
    fd.set('permit_type', permitType)
    if (submittedAt) fd.set('submitted_at', submittedAt)
    if (expectedAt) fd.set('expected_approval_at', expectedAt)
    if (notes.trim()) fd.set('notes', notes.trim())
    startTransition(async () => {
      const result = await createPermit(fd)
      if (result.error) {
        setError(result.error)
      } else {
        reset()
        setOpen(false)
      }
    })
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Add permit
      </button>
    )
  }

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '16px',
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 600, color: 'var(--color-neutral-900)' }}>
        New permit
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-600)', fontWeight: 500 }}>
            Permit type
          </span>
          <select
            value={permitType}
            onChange={(e) => setPermitType(e.target.value)}
            style={selectStyle}
          >
            {PERMIT_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {pt.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-600)', fontWeight: 500 }}>
            Submitted on (optional)
          </span>
          <input
            type="date"
            value={submittedAt}
            onChange={(e) => setSubmittedAt(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-600)', fontWeight: 500 }}>
            Expected approval (optional)
          </span>
          <input
            type="date"
            value={expectedAt}
            onChange={(e) => setExpectedAt(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-600)', fontWeight: 500 }}>
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>
      </div>
      {error && (
        <div
          style={{
            marginBottom: '10px',
            padding: '8px 12px',
            background: 'rgba(239, 68, 68, 0.08)',
            color: 'var(--color-danger, #ef4444)',
            fontSize: '0.8125rem',
            borderRadius: '4px',
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => {
            reset()
            setOpen(false)
          }}
        >
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={submit}>
          {pending ? 'Saving…' : 'Create permit'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '0.875rem',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  background: 'white',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'white',
  cursor: 'pointer',
}
