'use client'

import styles from './workspace.module.css'
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

export function ProjectListControls({
  basePath = '/projects',
}: ProjectListControlsProps) {
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
      className={styles.toolbar}
      aria-busy={isPending}
      aria-label="Project filters"
    >
      <label>
        Search projects
        <input
          type="search"
          value={qDraft}
          onChange={(event) => setQDraft(event.target.value)}
          placeholder="Project name or client"
        />
      </label>
      <label>
        Status
        <select value={status} onChange={handleStatusChange}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Project type
        <select value={type} onChange={handleTypeChange}>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sort
        <select value={sortValue} onChange={handleSortChange}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <button className={styles.primary} disabled={isPending}>
        {isPending ? 'Updating…' : 'Search'}
      </button>
      <button
        className={styles.secondary}
        type="button"
        onClick={() => {
          setQDraft('')
          navigate({
            q: undefined,
            status: undefined,
            type: undefined,
            sort: undefined,
            order: undefined,
          })
        }}
      >
        Reset
      </button>
      <div className={styles.actions} aria-label="Project view">
        <button
          type="button"
          className={styles.secondary}
          aria-pressed={searchParams.get('view') !== 'table'}
          onClick={() => navigate({ view: undefined })}
        >
          Cards
        </button>
        <button
          type="button"
          className={styles.secondary}
          aria-pressed={searchParams.get('view') === 'table'}
          onClick={() => navigate({ view: 'table' })}
        >
          Table
        </button>
      </div>
    </form>
  )
}
