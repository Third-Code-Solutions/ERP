'use client'

import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import {
  projectDocumentListResultSchema,
  projectDocumentRowSchema,
  type ProjectDocumentListResult,
  type ProjectDocumentRow,
} from '@third-code-erp/shared-types'
import { listQualityProjectDocuments } from './document-actions'

export interface QualityDocumentPickerProps {
  projectId: string
  value: ProjectDocumentRow | null
  onChange: (value: ProjectDocumentRow | null) => void
  disabled?: boolean
}

const LIMIT = 25
const panelStyle = { display: 'grid', gap: 8, minWidth: 0 } as const

function documentLabel(row: ProjectDocumentRow): string {
  return `${row.documentType.replace(/_/g, ' ')} · ${new Date(row.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}`
}

/** Remount local navigation on project changes; the parent owns selection. */
export function QualityDocumentPicker(props: QualityDocumentPickerProps) {
  return <ProjectDocumentPickerScope key={props.projectId} {...props} />
}

function ProjectDocumentPickerScope({ projectId, value, onChange, disabled = false }: QualityDocumentPickerProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<ProjectDocumentListResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [requestedPage, setRequestedPage] = useState(1)
  const sequence = useRef(0)
  const mounted = useRef(false)
  const selection = projectDocumentRowSchema.safeParse(value)
  const selected = selection.success && selection.data.projectId.toLowerCase() === projectId.toLowerCase() ? selection.data : null
  const invalidSelection = value !== null && selected === null

  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; sequence.current += 1 }
  }, [])
  useLayoutEffect(() => {
    if (disabled) {
      sequence.current += 1
      setLoading(false)
    }
  }, [disabled])

  async function load(page: number): Promise<void> {
    if (disabled) return
    const request = ++sequence.current
    setRequestedPage(page)
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await listQualityProjectDocuments(projectId, { page, limit: LIMIT })
      if (!mounted.current || request !== sequence.current) return
      if (!response.ok) { setError(response.error); return }
      const parsed = projectDocumentListResultSchema.safeParse(response.data)
      if (!parsed.success || parsed.data.projectId.toLowerCase() !== projectId.toLowerCase()
        || parsed.data.rows.some(row => row.projectId.toLowerCase() !== projectId.toLowerCase())
        || parsed.data.page !== page || parsed.data.limit !== LIMIT) {
        setError('Project documents returned an invalid scope or page. Try again.')
        return
      }
      setResult(parsed.data)
    } catch {
      if (mounted.current && request === sequence.current) setError('Project documents could not be loaded. Try again.')
    } finally {
      if (mounted.current && request === sequence.current) setLoading(false)
    }
  }

  function toggle(): void {
    if (disabled) return
    if (open) {
      sequence.current += 1
      setLoading(false)
      setOpen(false)
    } else {
      setOpen(true)
      void load(1)
    }
  }

  return (
    <div style={panelStyle}>
      <input type="hidden" name="planDocumentId" value={selected?.id ?? ''} />
      <div className="form-label">Project document <span className="form-help">optional</span></div>
      {invalidSelection ? <p role="alert" style={{ margin: 0 }}>The selected document is invalid or does not belong to this project. Clear it and choose a project document.</p> : null}
      {selected ? <div role="status" style={{ overflowWrap: 'anywhere' }}><strong>{selected.fileName}</strong><div className="form-help">{documentLabel(selected)}</div></div> : !invalidSelection ? <p className="form-help" style={{ margin: 0 }}>No project document selected. You may continue without one.</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="button-secondary" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={toggle}>{open ? 'Close document chooser' : 'Choose project document'}</button>
        {value !== null ? <button type="button" className="button-secondary" disabled={disabled} onClick={() => { if (!disabled) onChange(null) }}>Clear selection</button> : null}
      </div>
      {open ? <div id={id} style={panelStyle} aria-busy={loading}>
        {loading ? <p role="status" style={{ margin: 0 }}>Loading project documents…</p> : null}
        {error ? <div style={panelStyle}><p role="alert" style={{ margin: 0 }}>{error}</p><button type="button" className="button-secondary" disabled={disabled || loading} onClick={() => void load(requestedPage)}>Retry loading documents</button></div> : null}
        {result ? <>
          <p className="form-help" role="status" style={{ margin: 0 }}>{result.total} project documents · Page {result.page} of {result.totalPages}</p>
          {result.rows.length ? <ul aria-label="Project documents" style={{ ...panelStyle, listStyle: 'none', margin: 0, padding: 0 }}>{result.rows.map(row => <li key={row.id} style={{ ...panelStyle, border: '1px solid var(--color-border)', borderRadius: 6, padding: 10, overflowWrap: 'anywhere' }}>
            <strong>{row.fileName}</strong><span className="form-help">{documentLabel(row)}</span>
            <button type="button" className="button-secondary" disabled={disabled || loading} aria-pressed={selected?.id === row.id} aria-label={`Select ${row.fileName}`} onClick={() => { if (!disabled && !loading) onChange(row) }}>{selected?.id === row.id ? 'Selected' : 'Select document'}</button>
          </li>)}</ul> : <p role="status" style={{ margin: 0 }}>{result.total === 0 ? 'No project documents are available. You may continue without one.' : 'No documents on this page. Return to the first page.'}</p>}
          <nav aria-label="Project document pages" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="button-secondary" disabled={disabled || loading || result.page === 1} onClick={() => void load(1)}>First page</button>
            <button type="button" className="button-secondary" disabled={disabled || loading || result.page <= 1 || result.page > result.totalPages} onClick={() => void load(result.page - 1)}>Previous</button>
            <button type="button" className="button-secondary" disabled={disabled || loading || result.page >= result.totalPages || result.page >= 100000} onClick={() => void load(result.page + 1)}>Next</button>
          </nav>
        </> : null}
      </div> : null}
    </div>
  )
}
