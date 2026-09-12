'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ProjectScheduleDependencyKind, ProjectScheduleDependencyOption, ProjectScheduleDependencyResult, ProjectScheduleLevel } from '@third-code-erp/shared-types'
import { loadProjectScheduleDependencies } from './dependency-actions'
import styles from './schedule-dependency-select.module.css'

export type ScheduleDependencyKind = ProjectScheduleDependencyKind

type SelectionStatus = 'empty' | 'unknown' | 'verified' | 'missing'

export interface ScheduleDependencySelectProps {
  projectId: string
  kind: ScheduleDependencyKind
  level: ProjectScheduleLevel
  taskId?: string
  name: 'parentTaskId' | 'predecessorTaskId'
  value: string | null
  onChange: (value: string | null) => void
  enabled: boolean
  disabled?: boolean
  resetToken?: number
}

const PAGE_LIMIT = 25
const LEVEL_ORDER: Record<ProjectScheduleLevel, number> = { l1: 1, l2: 2, l3: 3, l4: 4 }

function titleFor(kind: ScheduleDependencyKind): string {
  return kind === 'parent' ? 'Parent task' : 'Predecessor task'
}

function pluralTitleFor(kind: ScheduleDependencyKind): string {
  return kind === 'parent' ? 'parent tasks' : 'predecessor tasks'
}

function formatOption(option: ProjectScheduleDependencyOption): string {
  return `${option.taskCode} · ${option.name} (${option.level.toUpperCase()})`
}

function optionLabelFor(kind: ScheduleDependencyKind, value: string | null, selectionStatus: SelectionStatus, selection: ProjectScheduleDependencyOption | null): string {
  if (selection && selection.id === value) return formatOption(selection)
  if (selectionStatus === 'missing') return `Current ${kind} task is unavailable`
  return `Current ${kind} task (details loading)`
}

export function isScheduleDependencyCompatible(kind: ScheduleDependencyKind, taskLevel: ProjectScheduleLevel, dependencyLevel: ProjectScheduleLevel): boolean {
  return kind === 'predecessor'
    ? dependencyLevel === taskLevel
    : LEVEL_ORDER[dependencyLevel] < LEVEL_ORDER[taskLevel]
}

export function mergeScheduleDependencyOptions(rows: ProjectScheduleDependencyOption[], selected: ProjectScheduleDependencyOption | null, value: string | null): ProjectScheduleDependencyOption[] {
  const options = new Map<string, ProjectScheduleDependencyOption>()
  for (const row of rows) options.set(row.id, row)
  if (selected && selected.id === value) options.set(selected.id, selected)
  return [...options.values()]
}

function errorForSelection(
  kind: ScheduleDependencyKind,
  level: ProjectScheduleLevel,
  value: string | null,
  selectionStatus: SelectionStatus,
  selection: ProjectScheduleDependencyOption | null,
): string | null {
  if (!value) return null
  if (selectionStatus === 'missing') return `This ${kind} task is no longer available in this project. Clear it or choose a replacement before saving.`
  if (selection && !isScheduleDependencyCompatible(kind, level, selection.level)) {
    return `This ${kind} task is not compatible with ${level.toUpperCase()}. Clear it or choose a compatible task before saving.`
  }
  return null
}

export function ScheduleDependencySelect({
  projectId,
  kind,
  level,
  taskId,
  name,
  value,
  onChange,
  enabled,
  disabled = false,
  resetToken,
}: ScheduleDependencySelectProps) {
  const title = titleFor(kind)
  const pluralTitle = pluralTitleFor(kind)
  const instanceId = useId().replace(/:/g, '')
  const selectId = `schedule-${kind}-select-${instanceId}`
  const searchId = `schedule-${kind}-search-${instanceId}`
  const stateId = `schedule-${kind}-state-${instanceId}`
  const errorId = `schedule-${kind}-error-${instanceId}`
  const selectRef = useRef<HTMLSelectElement>(null)
  const requestSequence = useRef(0)
  const lastValue = useRef(value)
  const lastLevel = useRef(level)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [retryToken, setRetryToken] = useState(0)
  const [result, setResult] = useState<ProjectScheduleDependencyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selection, setSelection] = useState<ProjectScheduleDependencyOption | null>(null)
  const [selectionStatus, setSelectionStatus] = useState<SelectionStatus>(value ? 'unknown' : 'empty')

  useEffect(() => {
    if (value === lastValue.current) return
    lastValue.current = value
    if (!value) {
      setSelection(null)
      setSelectionStatus('empty')
      return
    }
    if (selection?.id !== value) {
      setSelection(null)
      setSelectionStatus('unknown')
    }
  }, [selection?.id, value])

  useEffect(() => {
    if (resetToken === undefined) return
    setSearchInput('')
    setSearch('')
    setPage(1)
  }, [resetToken])

  useEffect(() => {
    if (lastLevel.current === level) return
    lastLevel.current = level
    setPage(1)
    setResult(null)
  }, [level])

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 250)
    return () => globalThis.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!enabled) return
    const sequence = ++requestSequence.current
    let active = true
    setLoading(true)
    setError(null)
    setResult(null)
    const query = {
      kind,
      level,
      excludeTaskId: taskId,
      selectedTaskId: value || undefined,
      search: search || undefined,
      page,
      limit: PAGE_LIMIT,
    }
    void loadProjectScheduleDependencies(projectId, query).then((response) => {
      if (!active || sequence !== requestSequence.current) return
      setLoading(false)
      if (!response.ok) {
        setError(response.error)
        return
      }
      const nextResult: ProjectScheduleDependencyResult = response.data
      setResult(nextResult)
      setError(null)
      if (!value) {
        setSelection(null)
        setSelectionStatus('empty')
        return
      }
      const nextSelection = nextResult.selected?.id === value
        ? nextResult.selected
        : nextResult.rows.find((row) => row.id === value) ?? null
      if (nextSelection) {
        setSelection(nextSelection)
        setSelectionStatus('verified')
      } else {
        setSelection(null)
        setSelectionStatus('missing')
      }
    }).catch(() => {
      if (!active || sequence !== requestSequence.current) return
      setLoading(false)
      setError('Task choices could not be loaded. Retry without changing your selection.')
    })
    return () => {
      active = false
    }
  }, [enabled, kind, level, page, projectId, retryToken, search, taskId, value])

  const currentResult = result && result.kind === kind && result.level === level && result.page === page ? result : null
  const options = useMemo(() => mergeScheduleDependencyOptions(currentResult?.rows ?? [], selection, value), [currentResult?.rows, selection, value])
  const selectionError = errorForSelection(kind, level, value, selectionStatus, selection)
  const describedBy = selectionError ? `${stateId} ${errorId}` : stateId

  useEffect(() => {
    const select = selectRef.current
    select?.setCustomValidity(selectionError ?? '')
    return () => select?.setCustomValidity('')
  }, [selectionError])

  const handleSelectChange = (nextValue: string) => {
    if (!nextValue) {
      setSelection(null)
      setSelectionStatus('empty')
      onChange(null)
      return
    }
    const nextSelection = options.find((option) => option.id === nextValue) ?? null
    setSelection(nextSelection)
    setSelectionStatus(nextSelection ? 'verified' : 'unknown')
    onChange(nextValue)
  }

  const clear = () => {
    setSelection(null)
    setSelectionStatus('empty')
    onChange(null)
    selectRef.current?.focus()
  }

  const hasReservedSelection = Boolean(value && !options.some((option) => option.id === value))
  const emptyMessage = currentResult && currentResult.rows.length === 0
    ? options.length > 0
      ? `No other ${pluralTitle} match this search.`
      : `No ${pluralTitle} are available for ${level.toUpperCase()}.`
    : null

  return (
    <div className={styles.field} data-dependency-kind={kind}>
      <label className="form-label" htmlFor={selectId}>{title}</label>
      <div className={styles.selectRow}>
        <select
          ref={selectRef}
          id={selectId}
          name={name}
          className="form-input"
          value={value ?? ''}
          onChange={(event) => handleSelectChange(event.currentTarget.value)}
          disabled={disabled}
          aria-invalid={selectionError ? 'true' : undefined}
          aria-describedby={describedBy}
          aria-busy={loading}
        >
          <option value="">No {kind} task</option>
          {hasReservedSelection && value ? <option value={value}>{optionLabelFor(kind, value, selectionStatus, selection)}</option> : null}
          {options.map((option) => <option key={option.id} value={option.id}>{formatOption(option)}</option>)}
        </select>
        {value ? <button type="button" className={`button-secondary ${styles.clearButton}`} onClick={clear} disabled={disabled}>Clear</button> : null}
      </div>
      <div className={styles.searchRow}>
        <label className={styles.searchLabel} htmlFor={searchId}>Search {pluralTitle}</label>
        <input
          id={searchId}
          className={`form-input ${styles.searchInput}`}
          type="search"
          value={searchInput}
          maxLength={200}
          placeholder="Code or task name"
          onChange={(event) => { setSearchInput(event.currentTarget.value); setPage(1); setResult(null) }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); setSearch(event.currentTarget.value); setPage(1) } }}
          disabled={disabled}
          aria-controls={selectId}
        />
      </div>
      <div id={stateId} className={styles.state} aria-live="polite">
        {!enabled ? <span>Open the task form to load {pluralTitle}.</span> : null}
        {enabled && loading ? <span>Loading {pluralTitle}…</span> : null}
        {enabled && !loading && emptyMessage ? <span>{emptyMessage}</span> : null}
        {enabled && !loading && !error && currentResult && currentResult.rows.length > 0 ? <span>{currentResult.total.toLocaleString('en-PH')} {currentResult.total === 1 ? pluralTitle.slice(0, -1) : pluralTitle} found</span> : null}
      </div>
      {selectionError ? <p id={errorId} className={`${styles.error} form-error`} role="alert">{selectionError}</p> : null}
      {error ? <div className={styles.errorRow} role="alert"><span>{error}</span><button type="button" className="button-secondary" onClick={() => setRetryToken((token) => token + 1)} disabled={disabled}>Retry loading {pluralTitle}</button></div> : null}
      {enabled && currentResult && (currentResult.page > 1 || currentResult.page < currentResult.totalPages) ? <nav className={styles.pagination} aria-label={`${title} pages`}>
        <button type="button" className="button-secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={disabled || loading || currentResult.page <= 1} aria-label={`Previous ${pluralTitle}`}>Previous</button>
        <span aria-live="polite">Page {currentResult.page} of {currentResult.totalPages}</span>
        <button type="button" className="button-secondary" onClick={() => setPage((current) => Math.min(currentResult.totalPages, current + 1))} disabled={disabled || loading || currentResult.page >= currentResult.totalPages} aria-label={`Next ${pluralTitle}`}>Next</button>
      </nav> : null}
    </div>
  )
}
