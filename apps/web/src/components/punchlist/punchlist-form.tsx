'use client'

// Create-punchlist form. Photos are not uploaded here — the existing 3-step
// signed-URL doc pipeline owns that flow, and addPunchlistPhoto attaches an
// existing document_id post-create on the detail page.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPunchlistItem } from '@/app/(dashboard)/punchlist/actions'

interface ProjectOption {
  id: string
  name: string
}

interface UserOption {
  id: string
  full_name: string | null
  email: string
}

interface PunchlistFormProps {
  projects: ProjectOption[]
  users: UserOption[]
  defaultProjectId?: string
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

export function PunchlistForm({ projects, users, defaultProjectId }: PunchlistFormProps) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createPunchlistItem(data)
      if (result?.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: '0.875rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    background: 'white',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-neutral-600)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 24,
        display: 'grid',
        gap: 16,
        maxWidth: 720,
      }}
    >
      <div>
        <label style={labelStyle}>Project</label>
        <select
          name="project_id"
          required
          defaultValue={defaultProjectId ?? ''}
          style={inputStyle}
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          name="description"
          required
          minLength={3}
          rows={3}
          placeholder="e.g. FCU-3F-02 making rattle at high fan speed"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Location</label>
          <input
            name="location"
            type="text"
            placeholder="3F · Pantry"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Trade</label>
          <input
            name="trade"
            type="text"
            placeholder="HVAC / Electrical / Plumbing"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Priority</label>
          <select name="priority" defaultValue="medium" style={inputStyle}>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Due date</label>
          <input name="due_date" type="date" style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Assign to teammate</label>
          <select name="assigned_to_user_id" defaultValue="" style={inputStyle}>
            <option value="">— No internal assignee —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Or external party</label>
          <input
            name="assigned_to_text"
            type="text"
            placeholder="e.g. Aircon Subcon"
            style={inputStyle}
          />
        </div>
      </div>

      <p
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-neutral-500)',
          margin: 0,
          padding: '8px 12px',
          background: 'var(--color-neutral-50)',
          borderRadius: 6,
        }}
      >
        Photos (up to 5) can be attached on the next screen after the item is created — use the Documents tab to upload, then link them as before/after evidence.
      </p>

      {error ? (
        <div
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '10px 12px',
            borderRadius: 6,
            fontSize: '0.8125rem',
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={isPending}
          style={{
            background: 'var(--color-navy-700)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '9px 18px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isPending ? 'wait' : 'pointer',
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? 'Creating…' : 'Create punchlist item'}
        </button>
      </div>
    </form>
  )
}
