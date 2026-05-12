'use client'

/**
 * Create-VO form (US-Con-002).
 *
 * Captures description + change_type (radio) + cost_impact (₱, converted
 * to cents server-side) + time_impact_days. Submits as FormData so the
 * server action stays plain.
 */

import { useState, useTransition } from 'react'
import { createVo, type VoChangeType } from '@/app/(dashboard)/projects/[id]/vos/actions'

interface Props {
  projectId: string
  onCreated?: () => void
}

const CHANGE_TYPES: { value: VoChangeType; label: string; hint: string }[] = [
  {
    value: 'client_initiated',
    label: 'Client-initiated',
    hint: 'Scope change requested by the client.',
  },
  {
    value: 'site_condition',
    label: 'Site condition',
    hint: 'Unforeseen physical condition discovered on site.',
  },
  {
    value: 'design_error',
    label: 'Design error',
    hint: 'Omission or error in the issued design.',
  },
]

export function VoCreateForm({ projectId, onCreated }: Props) {
  const [changeType, setChangeType] = useState<VoChangeType>('client_initiated')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    setSuccess(false)
    formData.set('change_type', changeType)
    startTransition(async () => {
      const res = await createVo(projectId, formData)
      if (res.error) setError(res.error)
      else {
        setSuccess(true)
        onCreated?.()
        // Reset the form via the DOM since we don't keep controlled state
        // for the text fields.
        const form = document.getElementById(`vo-create-${projectId}`) as HTMLFormElement | null
        form?.reset()
      }
    })
  }

  return (
    <form
      id={`vo-create-${projectId}`}
      action={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={labelStyle}>Description</span>
        <textarea
          name="description"
          required
          rows={3}
          placeholder="Scope change, reason, affected work…"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>

      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ ...labelStyle, marginBottom: 6 }}>Change type</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {CHANGE_TYPES.map((opt) => {
            const active = opt.value === changeType
            return (
              <label
                key={opt.value}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 10px',
                  border: `1px solid ${active ? 'var(--color-navy-700)' : 'var(--color-border)'}`,
                  borderRadius: 6,
                  background: active ? 'var(--color-neutral-50)' : 'white',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="change_type_pick"
                  value={opt.value}
                  checked={active}
                  onChange={() => setChangeType(opt.value)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>
                    {opt.label}
                  </span>
                  <span
                    style={{ display: 'block', fontSize: 11.5, color: 'var(--color-neutral-500)' }}
                  >
                    {opt.hint}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle}>Cost impact (₱)</span>
          <input
            type="number"
            name="cost_impact_php"
            step="0.01"
            defaultValue="0"
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle}>Time impact (days)</span>
          <input
            type="number"
            name="time_impact_days"
            step="1"
            defaultValue="0"
            required
            style={inputStyle}
          />
        </label>
      </div>

      {error && <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
      {success && (
        <p style={{ margin: 0, color: 'var(--color-success)', fontSize: 12 }}>
          VO created as draft.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '8px 14px',
          background: 'var(--color-navy-700)',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontWeight: 600,
          fontSize: 13,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {pending ? 'Creating…' : 'Create VO'}
      </button>
    </form>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-600)',
  fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'white',
}
