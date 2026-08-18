'use client'

import { useTransition, useState } from 'react'
import Link from 'next/link'
import { createProject } from './actions'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  fontSize: '0.875rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'var(--color-neutral-700)',
  marginBottom: '6px',
}

const fieldStyle: React.CSSProperties = {
  marginBottom: '20px',
}

export function NewProjectForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [idempotencyKey] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? ''
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await createProject(formData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create project')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <div style={fieldStyle}>
        <label htmlFor="name" style={labelStyle}>Project name *</label>
        <input id="name" name="name" type="text" required style={inputStyle} placeholder="Somnus Studios Phase 2" />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="client" style={labelStyle}>Client *</label>
        <input id="client" name="client" type="text" required style={inputStyle} placeholder="Acme Construction Inc." />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="location" style={labelStyle}>Location</label>
        <input id="location" name="location" type="text" style={inputStyle} placeholder="BGC, Taguig" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div>
          <label htmlFor="project_type" style={labelStyle}>Project type</label>
          <select id="project_type" name="project_type" style={{ ...inputStyle, background: 'white' }}>
            <option value="">Select type…</option>
            <option value="mep">MEP</option>
            <option value="fit_out">Fit-out</option>
            <option value="interior">Interior</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        <div>
          <label htmlFor="total_sqm" style={labelStyle}>Total area (sqm)</label>
          <input id="total_sqm" name="total_sqm" type="number" min="1" style={inputStyle} placeholder="1200" />
        </div>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="notes" style={labelStyle}>Notes</label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Additional context…"
        />
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '10px 12px',
            color: '#dc2626',
            fontSize: '0.8125rem',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: '8px 20px',
            background: isPending ? '#94a3b8' : 'var(--color-navy-700)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? 'Creating…' : 'Create Project'}
        </button>
        <Link
          href="/projects"
          style={{
            padding: '8px 16px',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            fontSize: '0.875rem',
            color: 'var(--color-neutral-700)',
            textDecoration: 'none',
          }}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
