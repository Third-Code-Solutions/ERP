'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type TakeoffRow = {
  sourceRowKey: string
  description: string
  quantity: number | null
  unit: string
  division: string | null
  location: string | null
  itemNo: string | null
}

type ValidationIssue = {
  sourceRowKey: string
  code: string
  message: string
}

type Preview = {
  rowCount: number
  validCount: number
  unresolvedCount: number
  rows: TakeoffRow[]
  validationIssues: ValidationIssue[]
  missingColumns: string[]
}

type TakeoffImportWizardProps = {
  projectId: string
  bomId: string
  bomLabel: string
  bomStatus: 'draft' | 'approved' | 'locked' | 'archived'
}

const DEFAULT_MAPPING = {
  sourceRowKey: 'Row',
  description: 'Description',
  quantity: 'Quantity',
  unit: 'UOM',
  division: 'Division',
  location: 'Location',
  itemNo: 'Item No',
  notes: 'Notes',
}

export function TakeoffImportWizard({
  projectId,
  bomId,
  bomLabel,
  bomStatus,
}: TakeoffImportWizardProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('generic')
  const [mapping, setMapping] = useState(DEFAULT_MAPPING)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditable = bomStatus === 'draft'
  const issueRows = useMemo(
    () => new Set((preview?.validationIssues ?? []).map((issue) => issue.sourceRowKey)),
    [preview],
  )

  const run = useCallback(async (mode: 'preview' | 'commit') => {
    if (!file || !isEditable) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('bom_id', bomId)
      form.set('source', source.trim() || 'generic')
      form.set('mode', mode)
      form.set('drawing_revision_key', file.name)
      form.set(
        'mapping',
        JSON.stringify(
          Object.fromEntries(Object.entries(mapping).filter(([, value]) => value.trim())),
        ),
      )

      const response = await fetch('/api/bom/takeoff-import', { method: 'POST', body: form })
      const payload = (await response.json()) as
        | (Preview & { ok: true; mode: 'preview' })
        | { ok: false; error?: { message?: string } }

      if (!response.ok || !payload.ok) {
        throw new Error(!payload.ok ? payload.error?.message ?? 'Import failed.' : `Import failed (${response.status}).`)
      }

      if (mode === 'preview') {
        setPreview(payload)
      } else {
        router.push(`/projects/${projectId}/bom`)
        router.refresh()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }, [bomId, file, isEditable, mapping, projectId, router, source])

  const reset = useCallback(() => {
    setFile(null)
    setPreview(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="card" aria-labelledby="takeoff-import-title">
        <div className="card-header">
          <div>
            <h2 id="takeoff-import-title" className="card-title">Structured takeoff intake</h2>
            <p className="card-subtitle">Target BOM: <strong>{bomLabel}</strong> · {bomStatus}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16, padding: 18 }}>
          {!isEditable && <div role="alert" className="card-empty">This BOM is {bomStatus} and cannot accept a takeoff.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Field label="Source" value={source} onChange={setSource} />
            <Field label="Description column" value={mapping.description} onChange={(value) => setMapping((current) => ({ ...current, description: value }))} />
            <Field label="Quantity column" value={mapping.quantity} onChange={(value) => setMapping((current) => ({ ...current, quantity: value }))} />
            <Field label="UOM column" value={mapping.unit} onChange={(value) => setMapping((current) => ({ ...current, unit: value }))} />
            <Field label="Division column" value={mapping.division} onChange={(value) => setMapping((current) => ({ ...current, division: value }))} optional />
            <Field label="Location column" value={mapping.location} onChange={(value) => setMapping((current) => ({ ...current, location: value }))} optional />
          </div>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-neutral-600)' }}>
            Takeoff CSV or XLSX
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError(null) }}
              disabled={busy || !isEditable}
            />
          </label>
          {file && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-600)' }}>{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button button-primary" onClick={() => void run('preview')} disabled={!file || busy || !isEditable}>Preview intake</button>
            <button type="button" className="button button-secondary" onClick={reset} disabled={busy}>Reset</button>
          </div>
          {error && <p role="alert" style={{ margin: 0, color: 'var(--color-danger)', fontSize: 13 }}>{error}</p>}
        </div>
      </section>

      {preview && (
        <section className="card" aria-labelledby="takeoff-review-title">
          <div className="card-header" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <h2 id="takeoff-review-title" className="card-title">Review before import</h2>
              <p className="card-subtitle">{preview.rowCount} rows · {preview.validCount} ready · {preview.unresolvedCount} unresolved</p>
            </div>
            <button type="button" className="button button-primary" onClick={() => void run('commit')} disabled={busy || !isEditable || preview.rows.length === 0}>Import rows</button>
          </div>
          {preview.unresolvedCount > 0 && (
            <div role="status" style={{ margin: 18, padding: 12, border: '1px solid var(--color-warning)', color: 'var(--color-neutral-700)', background: 'var(--color-warning-soft)', borderRadius: 8, fontSize: 13 }}>
              Unresolved rows will be imported as draft scope and listed in the review queue. Client approval remains blocked until they are resolved.
            </div>
          )}
          <div style={{ overflowX: 'auto', padding: '0 18px 18px' }}>
            <table className="data-table">
              <thead><tr><th>Source row</th><th>Description</th><th className="numeric">Qty</th><th>UOM</th><th>Division</th><th>Status</th></tr></thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.sourceRowKey}>
                    <td>{row.sourceRowKey}</td>
                    <td>{row.description || '—'}</td>
                    <td className="numeric">{row.quantity ?? '—'}</td>
                    <td>{row.unit || '—'}</td>
                    <td>{row.division ?? '—'}</td>
                    <td>{issueRows.has(row.sourceRowKey) ? 'Unresolved' : 'Ready'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.validationIssues.length > 0 && (
            <div style={{ display: 'grid', gap: 6, padding: '0 18px 18px', fontSize: 12, color: 'var(--color-neutral-600)' }}>
              {preview.validationIssues.slice(0, 12).map((issue, index) => <div key={`${issue.sourceRowKey}-${issue.code}-${index}`}>{issue.sourceRowKey}: {issue.message}</div>)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Field({ label, value, onChange, optional = false }: { label: string; value: string; onChange: (value: string) => void; optional?: boolean }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-neutral-600)' }}>
      {label}{optional ? ' (optional)' : ''}
      <input value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
    </label>
  )
}
