'use client'

import React, { useRef, useState, useTransition } from 'react'

import { addInspectionRfi } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

interface RfiFormProps {
  opportunityId: string
  inspectionId: string
  submissionId: string
}

export function RfiForm({ opportunityId, inspectionId, submissionId }: RfiFormProps) {
  const [retryKey, setRetryKey] = useState(submissionId)
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'minor' | 'major'>('minor')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inFlightRef = useRef(false)

  function onSubmit(formData: FormData) {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        const result = await addInspectionRfi(opportunityId, inspectionId, formData)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setSuccess(
          result.replayed
            ? 'This RFI was already added. The existing record was recovered.'
            : 'RFI added.',
        )
        setDescription('')
        setPriority('minor')
        setRetryKey(crypto.randomUUID())
      } catch {
        setError('Unable to add the RFI. Please retry.')
      } finally {
        inFlightRef.current = false
      }
    })
  }

  return (
    <form
      action={onSubmit}
      aria-busy={pending}
      aria-describedby="rfi-form-status"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <input type="hidden" name="submission_id" value={retryKey} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 6 }}>
        <div>
          <label className="form-label" htmlFor="rfi-description">Description</label>
          <input
            id="rfi-description"
            name="description"
            required
            minLength={2}
            maxLength={2000}
            placeholder="New RFI…"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              setError(null)
              setSuccess(null)
            }}
            style={{
              width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13,
              padding: '7px 9px', border: '1px solid var(--color-border)', borderRadius: 4,
            }}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="rfi-priority">Priority</label>
          <select
            id="rfi-priority"
            name="priority"
            value={priority}
            onChange={(event) => {
              const nextPriority = event.target.value
              if (nextPriority === 'minor' || nextPriority === 'major') {
                setPriority(nextPriority)
              }
              setError(null)
              setSuccess(null)
            }}
            style={{
              width: '100%', fontFamily: 'inherit', fontSize: 13, padding: '7px 9px',
              border: '1px solid var(--color-border)', borderRadius: 4,
            }}
          >
            <option value="minor">Minor</option>
            <option value="major">Major</option>
          </select>
        </div>
      </div>
      <div id="rfi-form-status" aria-live="polite">
        {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
        {success && <p role="status" style={{ color: 'var(--color-success)', fontSize: 12 }}>{success}</p>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="user-chip"
        style={{ alignSelf: 'flex-start', cursor: pending ? 'wait' : 'pointer' }}
      >
        {pending ? 'Adding…' : 'Add RFI'}
      </button>
    </form>
  )
}
