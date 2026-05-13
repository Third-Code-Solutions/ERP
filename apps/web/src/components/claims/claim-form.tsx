'use client'

// Create-claim form. Saves as draft; submit / certify / handover transitions
// live on the detail page so the estimator can refine before kicking off the
// approval chain.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClaim } from '@/app/(dashboard)/claims/actions'

interface ProjectOption {
  id: string
  name: string
}

interface ClaimFormProps {
  projects: ProjectOption[]
  defaultProjectId?: string
}

export function ClaimForm({ projects, defaultProjectId }: ClaimFormProps) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createClaim(data)
      if (result?.error) {
        setError(result.error)
        return
      }
      if (result?.id) {
        router.push(`/claims/${result.id}`)
        return
      }
      router.refresh()
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Milestone %</label>
          <input
            name="milestone_pct"
            type="number"
            min={0}
            max={100}
            step={1}
            required
            placeholder="50"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Amount (₱)</label>
          <input
            name="amount_php"
            type="number"
            min={0.01}
            step="0.01"
            required
            placeholder="1250000.00"
            style={inputStyle}
          />
        </div>
      </div>

      <div
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-neutral-500)',
          padding: '10px 12px',
          background: 'var(--color-neutral-50)',
          borderRadius: 6,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: 'var(--color-neutral-700)' }}>Typical milestones:</strong>{' '}
        25% form work · 50% rough-in · 75% finishes · 100% turnover.
      </div>

      <div>
        <label style={labelStyle}>Description (optional)</label>
        <textarea
          name="description"
          rows={4}
          maxLength={5000}
          placeholder="Scope covered by this claim — e.g. completed 3F-5F rough-in, FCU set including hangers and condensate piping."
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

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
          {isPending ? 'Saving…' : 'Save as draft'}
        </button>
      </div>
    </form>
  )
}
