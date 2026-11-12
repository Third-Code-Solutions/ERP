'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCentavos } from '@/lib/operations/boq-excel/cells'

type TakeoffRow = {
  sourceRowKey: string
  description: string
  quantity: number | null
  unit: string
  division: string | null
  location: string | null
  itemNo: string | null
  unitRateCentavos?: number | null
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
  headerRow?: number
  skippedRows?: number
  /** Rows with an amount that were not imported (totals, VAT, amounts with no quantity). */
  skippedAmountRows?: Array<{ sheet: string | null; row: number; label: string; amount: string; reason: string }>
  sectionRows?: number
  warnings?: ValidationIssue[]
  workbook?: { sheets: string[]; sheet: string }
  /** Lines already on the BOM, and rows that update a line of an earlier import of this file. */
  existingLineCount?: number
  matchedLineCount?: number
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
  code: 'Code',
  notes: 'Notes',
  unitRate: 'Unit Rate (PHP)',
  amount: 'Amount (PHP)',
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
  const [sheets, setSheets] = useState<string[]>([])
  const [sheet, setSheet] = useState('')
  const [headerRow, setHeaderRow] = useState('')
  const [sectionHeaders, setSectionHeaders] = useState(true)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmedAdd, setConfirmedAdd] = useState(false)
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
      if (sheet) form.set('sheet', sheet)
      if (headerRow.trim()) form.set('header_row', headerRow.trim())
      form.set('section_headers', sectionHeaders ? 'on' : 'off')
      // A blanked optional column is sent as "" so the server does not guess it.
      form.set(
        'mapping',
        JSON.stringify(Object.fromEntries(Object.entries(mapping).map(([key, value]) => [key, value.trim()]))),
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
        setConfirmedAdd(false)
        if (payload.workbook) {
          setSheets(payload.workbook.sheets)
          setSheet(payload.workbook.sheet)
        }
      } else {
        router.push(`/projects/${projectId}/bom`)
        router.refresh()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }, [bomId, file, headerRow, isEditable, mapping, projectId, router, sectionHeaders, sheet, source])

  // Commit re-parses with the current mapping, so a preview made with the old
  // one must not stay on screen.
  const mapColumn = (key: keyof typeof DEFAULT_MAPPING) => (value: string) => {
    setMapping((current) => ({ ...current, [key]: value }))
    setPreview(null)
  }

  // Rows that match no line of an earlier import of this file become new
  // lines; on a BOM that already has lines the user has to confirm that.
  const existingLines = preview?.existingLineCount ?? 0
  const matchedLines = preview?.matchedLineCount ?? 0
  const addedLines = preview && existingLines > 0 ? preview.rowCount - matchedLines : 0

  const reset = useCallback(() => {
    setFile(null)
    setPreview(null)
    setError(null)
    setSheets([])
    setSheet('')
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
            <Field label="Description column" value={mapping.description} onChange={mapColumn('description')} />
            <Field label="Quantity column" value={mapping.quantity} onChange={mapColumn('quantity')} />
            <Field label="UOM column" value={mapping.unit} onChange={mapColumn('unit')} />
            <Field label="Division column" value={mapping.division} onChange={mapColumn('division')} optional />
            <Field label="Location column" value={mapping.location} onChange={mapColumn('location')} optional />
            <Field label="Code column" value={mapping.code} onChange={mapColumn('code')} optional />
            <Field label="Notes column" value={mapping.notes} onChange={mapColumn('notes')} optional />
            <Field label="Unit rate column" value={mapping.unitRate} onChange={mapColumn('unitRate')} optional />
            <Field label="Amount column" value={mapping.amount} onChange={mapColumn('amount')} optional />
            <Field label="Header row" value={headerRow} onChange={(value) => { setHeaderRow(value); setPreview(null) }} optional placeholder="Auto (1-50)" inputMode="numeric" />
            {sheets.length > 0 && (
              <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-neutral-600)' }}>
                Worksheet
                <select value={sheet} onChange={(event) => { setSheet(event.target.value); setPreview(null) }} disabled={busy}>
                  {sheets.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            )}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--color-neutral-700)' }}>
            <input type="checkbox" checked={sectionHeaders} onChange={(event) => { setSectionHeaders(event.target.checked); setPreview(null) }} />
            Rows with no quantity, unit, rate or amount are section headers (they set the division below)
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-neutral-600)' }}>
            Takeoff CSV or XLSX
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError(null); setSheets([]); setSheet('') }}
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
              <p className="card-subtitle">
                {preview.workbook ? `Sheet "${preview.workbook.sheet}" · ` : ''}header row {preview.headerRow ?? 1} · {preview.sectionRows ?? 0} section headers · {preview.skippedRows ?? 0} blank, total or amount-only rows skipped
              </p>
            </div>
            <button type="button" className="button button-primary" onClick={() => void run('commit')} disabled={busy || !isEditable || preview.rows.length === 0 || (addedLines > 0 && !confirmedAdd)}>Import rows</button>
          </div>
          {addedLines > 0 && (
            <div role="alert" style={{ display: 'grid', gap: 8, margin: 18, padding: 12, border: '1px solid var(--color-warning)', color: 'var(--color-neutral-700)', background: 'var(--color-warning-soft)', borderRadius: 8, fontSize: 13 }}>
              <span>
                This BOM already has {existingLines} line{existingLines === 1 ? '' : 's'}. Importing this file adds {addedLines} new line{addedLines === 1 ? '' : 's'} to {existingLines === 1 ? 'it' : 'them'}{matchedLines > 0 ? ` and updates ${matchedLines}` : ''}. It does not replace or remove any line, so importing lines that are already on the BOM under another file name duplicates them.
              </span>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={confirmedAdd} onChange={(event) => setConfirmedAdd(event.target.checked)} />
                Add {addedLines} line{addedLines === 1 ? '' : 's'} to this BOM
              </label>
            </div>
          )}
          {preview.unresolvedCount > 0 && (
            <div role="status" style={{ margin: 18, padding: 12, border: '1px solid var(--color-warning)', color: 'var(--color-neutral-700)', background: 'var(--color-warning-soft)', borderRadius: 8, fontSize: 13 }}>
              Unresolved rows will be imported as draft scope and listed in the review queue. Client approval remains blocked until they are resolved.
            </div>
          )}
          <div style={{ overflowX: 'auto', padding: '0 18px 18px' }}>
            <table className="data-table">
              <thead><tr><th>Source row</th><th>Description</th><th className="numeric">Qty</th><th>UOM</th><th className="numeric">Unit rate (PHP)</th><th>Division</th><th>Status</th></tr></thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.sourceRowKey}>
                    <td>{row.sourceRowKey}</td>
                    <td>{row.description || '—'}</td>
                    <td className="numeric">{row.quantity ?? '—'}</td>
                    <td>{row.unit || '—'}</td>
                    <td className="numeric">{typeof row.unitRateCentavos === 'number' ? formatCentavos(row.unitRateCentavos) : '—'}</td>
                    <td>{row.division ?? '—'}</td>
                    <td>{issueRows.has(row.sourceRowKey) ? 'Unresolved' : 'Ready'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.skippedAmountRows && preview.skippedAmountRows.length > 0 && (
            <div role="status" style={{ display: 'grid', gap: 6, margin: '0 18px 18px', padding: 12, border: '1px solid var(--color-warning)', background: 'var(--color-warning-soft)', borderRadius: 8, fontSize: 12, color: 'var(--color-neutral-700)' }}>
              <strong>{preview.skippedAmountRows.length} row{preview.skippedAmountRows.length === 1 ? '' : 's'} with an amount not imported</strong>
              {preview.skippedAmountRows.map((skipped) => <div key={`${skipped.sheet ?? ''}-${skipped.row}`}>{skipped.sheet ? `Sheet "${skipped.sheet}" ` : ''}row {skipped.row}: {skipped.label || '(no label)'} · PHP {skipped.amount} · {skipped.reason}</div>)}
            </div>
          )}
          {(preview.warnings?.length ?? 0) > 0 && (
            <div role="status" style={{ display: 'grid', gap: 6, margin: '0 18px 18px', padding: 12, border: '1px solid var(--color-warning)', background: 'var(--color-warning-soft)', borderRadius: 8, fontSize: 12, color: 'var(--color-neutral-700)' }}>
              <strong>{preview.warnings!.length} spreadsheet warning{preview.warnings!.length === 1 ? '' : 's'}</strong>
              {preview.warnings!.slice(0, 12).map((warning, index) => <div key={`${warning.sourceRowKey}-${warning.code}-${index}`}>{warning.sourceRowKey}: {warning.message}</div>)}
            </div>
          )}
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

function Field({ label, value, onChange, optional = false, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; optional?: boolean; placeholder?: string; inputMode?: 'numeric' }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--color-neutral-600)' }}>
      {label}{optional ? ' (optional)' : ''}
      <input value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} placeholder={placeholder} inputMode={inputMode} />
    </label>
  )
}
