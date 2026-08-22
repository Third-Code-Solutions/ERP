'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

interface ProjectListControlsProps {
  basePath?: string
}

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'mep', label: 'MEP' },
  { value: 'fit_out', label: 'Fit-out' },
  { value: 'interior', label: 'Interior' },
  { value: 'structural_civil', label: 'Structural and Civil' },
]

const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'created_at:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name (A→Z)' },
  { value: 'name:desc', label: 'Name (Z→A)' },
  { value: 'status:asc', label: 'Status (A→Z)' },
  { value: 'status:desc', label: 'Status (Z→A)' },
]

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  background: 'white',
  fontSize: '0.875rem',
  color: 'var(--color-neutral-900)',
  minWidth: 0,
}

export function ProjectListControls({ basePath = '/projects' }: ProjectListControlsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const initialQ = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const type = searchParams.get('type') ?? ''
  const sort = searchParams.get('sort') ?? 'created_at'
  const order = searchParams.get('order') ?? 'desc'
  const sortValue = `${sort}:${order}`

  const [qDraft, setQDraft] = useState(initialQ)

  useEffect(() => {
    setQDraft(initialQ)
  }, [initialQ])

  function buildHref(updates: Record<string, string | undefined>): string {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    }
    // Always reset to first page when controls change
    next.delete('page')
    const qs = next.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  function navigate(updates: Record<string, string | undefined>) {
    startTransition(() => {
      router.push(buildHref(updates))
    })
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate({ q: qDraft.trim() })
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    navigate({ status: event.target.value })
  }

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    navigate({ type: event.target.value })
  }

  function handleSortChange(event: ChangeEvent<HTMLSelectElement>) {
    const [nextSort, nextOrder] = event.target.value.split(':')
    navigate({ sort: nextSort, order: nextOrder })
  }

  return (
    <form
      onSubmit={handleSearchSubmit}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
        marginBottom: '16px',
        opacity: isPending ? 0.7 : 1,
        transition: 'opacity 150ms ease',
      }}
      aria-busy={isPending}
    >
      <input
        type="search"
        name="q"
        value={qDraft}
        onChange={(event) => setQDraft(event.target.value)}
        placeholder="Search by name or client..."
        aria-label="Search projects"
        style={{ ...inputStyle, flex: '1 1 240px', minWidth: '200px' }}
      />
      <select
        value={status}
        onChange={handleStatusChange}
        aria-label="Filter by status"
        style={{ ...inputStyle, flex: '0 0 auto' }}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        value={type}
        onChange={handleTypeChange}
        aria-label="Filter by project type"
        style={{ ...inputStyle, flex: '0 0 auto' }}
      >
        {TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        value={sortValue}
        onChange={handleSortChange}
        aria-label="Sort projects"
        style={{ ...inputStyle, flex: '0 0 auto' }}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        style={{
          padding: '8px 16px',
          background: 'var(--color-navy-700)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '0.875rem',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Search
      </button>
    </form>
  )
}
