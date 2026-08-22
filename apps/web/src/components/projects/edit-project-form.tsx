'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { normalizeProjectType } from '@third-code-erp/shared-types'
import { updateProject } from '@/app/(dashboard)/projects/[id]/actions'

interface EditProjectFormProps {
  project: {
    id: string
    name: string
    client: string
    status: string
    project_type: string | null
    location: string | null
    total_sqm: number | null
    notes: string | null
  }
}

const STATUS_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const TYPE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'mep', label: 'MEP' },
  { value: 'fit_out', label: 'Fit-out' },
  { value: 'interior', label: 'Interior' },
  { value: 'structural_civil', label: 'Structural and Civil' },
]

export function EditProjectForm({ project }: EditProjectFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateProject(project.id, data)
      if (result.error) {
        setError(result.error)
      } else {
        setIsOpen(false)
        router.refresh()
      }
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          background: 'none',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          color: 'var(--color-neutral-700)',
          fontWeight: 500,
        }}
      >
        Edit Project
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'white',
          borderRadius: '10px',
          padding: '24px',
          width: '520px',
          maxWidth: '95vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 20px', color: 'var(--color-neutral-900)' }}>
          Edit Project
        </h2>

        <div style={{ display: 'grid', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Project Name *</label>
            <input name="name" required defaultValue={project.name} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Client *</label>
            <input name="client" required defaultValue={project.client} style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select name="status" defaultValue={project.status} style={inputStyle}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Project Type</label>
              <select name="project_type" defaultValue={normalizeProjectType(project.project_type) ?? ''} style={inputStyle}>
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Location</label>
              <input name="location" defaultValue={project.location ?? ''} placeholder="Makati, Metro Manila" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Area (sqm)</label>
              <input type="number" name="total_sqm" min="0" defaultValue={project.total_sqm ?? ''} placeholder="—" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea name="notes" rows={3} defaultValue={project.notes ?? ''} placeholder="Optional notes…" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: '0.8125rem', color: '#ef4444', margin: '12px 0 0' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '7px 14px', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--color-neutral-700)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '0.8125rem', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: 'var(--color-neutral-500)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
