'use client'

// Togal.ai import wizard — REFACTOR.md M3 / US-010 #6.
//
// Three-step flow:
//   1. Pick file (CSV/XLSX) — bom_id is fixed by the hosting page.
//   2. POST to /api/bom/togal-import for a preview (no DB writes). Show
//      mapped/unmapped counts + proposed lines.
//   3. POST proposed lines to /api/bom/togal-commit. On success, redirect to
//      the project BOM page.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ProposedLine {
  source_label: string
  material_item_id: string | null
  code: string | null
  description: string
  unit: string
  quantity: number
  wastage_bps: number
  effective_quantity: number
  unit_price_cents: number
  vendor_id: string | null
  line_total_cents: number
  level?: string
  room?: string
  notes?: string
}

interface PreviewResponse {
  row_count: number
  mapped_count: number
  unmapped_items: string[]
  missing_columns?: string[]
  proposed_lines: ProposedLine[]
}

interface CommitResponse {
  ok: true
  lines_created: number
  bom_id: string
  total_cost_cents: number
  tcv_cents: number
}

interface TogalImportWizardProps {
  projectId: string
  bomId: string
  bomLabel: string
  bomStatus: 'draft' | 'approved' | 'locked' | 'archived'
}

type Step = 'select' | 'preview' | 'committing' | 'done'

function formatPhp(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function TogalImportWizard({
  projectId,
  bomId,
  bomLabel,
  bomStatus,
}: TogalImportWizardProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [step, setStep] = useState<Step>('select')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const isLocked = bomStatus === 'locked' || bomStatus === 'archived'

  const mappedLines = useMemo(
    () =>
      (preview?.proposed_lines ?? []).filter(
        (line) => line.material_item_id !== null
      ),
    [preview]
  )

  const onFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null
    setFile(next)
    setPreview(null)
    setError(null)
  }, [])

  const onRunPreview = useCallback(async () => {
    if (!file) return
    setIsLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('bom_id', bomId)
      const res = await fetch('/api/bom/togal-import', {
        method: 'POST',
        body: form,
      })
      const payload = (await res.json()) as
        | PreviewResponse
        | { error: string }
      if (!res.ok || 'error' in payload) {
        const message =
          'error' in payload ? payload.error : `Preview failed (${res.status})`
        throw new Error(message)
      }
      setPreview(payload)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setIsLoading(false)
    }
  }, [file, bomId])

  const onCommit = useCallback(async () => {
    if (!preview || mappedLines.length === 0) return
    setShowConfirm(false)
    setStep('committing')
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bom/togal-commit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          bom_id: bomId,
          proposed_lines: mappedLines.map((line) => ({
            material_item_id: line.material_item_id,
            code: line.code,
            description: line.description,
            unit: line.unit,
            qty: line.effective_quantity,
            unit_cost_cents: line.unit_price_cents,
            vendor_id: line.vendor_id,
            source_label: line.source_label,
            notes: [line.level, line.room, line.notes]
              .filter((part): part is string => Boolean(part && part.length))
              .join(' · ') || null,
          })),
        }),
      })
      const payload = (await res.json()) as CommitResponse | { error: string }
      if (!res.ok || 'error' in payload) {
        const message =
          'error' in payload ? payload.error : `Commit failed (${res.status})`
        throw new Error(message)
      }
      setStep('done')
      router.push(`/projects/${projectId}/bom?bomId=${payload.bom_id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
      setStep('preview')
    } finally {
      setIsLoading(false)
    }
  }, [preview, mappedLines, bomId, projectId, router])

  const onReset = useCallback(() => {
    setFile(null)
    setPreview(null)
    setError(null)
    setStep('select')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Step 1 — file picker */}
      <section className="card" aria-labelledby="togal-step1">
        <div className="card-header">
          <div>
            <h2 id="togal-step1" className="card-title">
              1 · Select Togal.ai export
            </h2>
            <p className="card-subtitle">
              Target BOM: <strong>{bomLabel}</strong> ({bomStatus})
            </p>
          </div>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isLocked && (
            <div
              role="alert"
              style={{
                background: 'var(--color-warning-soft)',
                color: 'var(--color-warning)',
                border:
                  '1px solid color-mix(in oklch, var(--color-warning) 30%, transparent)',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              This BOM is {bomStatus} and cannot accept new lines.
            </div>
          )}
          <label
            htmlFor="togal-file"
            style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            CSV or XLSX export from Togal.ai (max 25MB)
          </label>
          <input
            id="togal-file"
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={onFileChange}
            disabled={isLocked || isLoading}
            style={{ fontSize: 13 }}
          />
          {file && (
            <p style={{ fontSize: 12, color: 'var(--color-neutral-600)', margin: 0 }}>
              Selected: <strong>{file.name}</strong> · {(file.size / 1024).toFixed(1)} KB
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onRunPreview}
              disabled={!file || isLocked || isLoading}
              style={primaryButtonStyle(!file || isLocked || isLoading)}
            >
              {isLoading && step === 'select' ? 'Parsing…' : 'Preview import'}
            </button>
            {(file || preview) && (
              <button
                type="button"
                onClick={onReset}
                disabled={isLoading}
                style={ghostButtonStyle}
              >
                Reset
              </button>
            )}
          </div>
          {error && step !== 'preview' && (
            <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: 0 }}>
              {error}
            </p>
          )}
        </div>
      </section>

      {/* Step 2 — review preview */}
      {preview ? (
        <section className="card" aria-labelledby="togal-step2">
          <div className="card-header">
            <div>
              <h2 id="togal-step2" className="card-title">
                2 · Review proposed lines
              </h2>
              <p className="card-subtitle">
                {preview.row_count} rows · {preview.mapped_count} mapped ·{' '}
                {preview.unmapped_items.length} unmapped
              </p>
            </div>
            <div className="card-toolbar">
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={
                  mappedLines.length === 0 || isLocked || step === 'committing'
                }
                style={primaryButtonStyle(
                  mappedLines.length === 0 || isLocked || step === 'committing'
                )}
              >
                Commit {mappedLines.length} line
                {mappedLines.length === 1 ? '' : 's'} to BOM
              </button>
            </div>
          </div>

          <PreviewBody
            preview={preview}
            mappedLines={mappedLines}
            error={error}
          />
        </section>
      ) : (
        <EmptyPreview hasFile={Boolean(file)} />
      )}

      {showConfirm && preview && (
        <ConfirmModal
          lineCount={mappedLines.length}
          bomLabel={bomLabel}
          onCancel={() => setShowConfirm(false)}
          onConfirm={onCommit}
        />
      )}
    </div>
  )
}

function PreviewBody({
  preview,
  mappedLines,
  error,
}: {
  preview: PreviewResponse
  mappedLines: ProposedLine[]
  error: string | null
}) {
  if (preview.missing_columns && preview.missing_columns.length > 0) {
    return (
      <div className="card-empty">
        File is missing required columns:{' '}
        <strong>{preview.missing_columns.join(', ')}</strong>. Re-export from
        Togal with the standard takeoff schema.
      </div>
    )
  }

  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {preview.unmapped_items.length > 0 && (
        <div
          role="alert"
          style={{
            background: 'var(--color-warning-soft)',
            color: 'var(--color-warning)',
            border:
              '1px solid color-mix(in oklch, var(--color-warning) 30%, transparent)',
            padding: '12px 14px',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <strong>
            {preview.unmapped_items.length} unmapped item
            {preview.unmapped_items.length === 1 ? '' : 's'}
          </strong>{' '}
          will be skipped on commit. Add a mapping in Settings → Material
          Mapping to include them:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {preview.unmapped_items.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      )}

      {mappedLines.length === 0 ? (
        <p className="card-empty">
          No mapped lines — commit is disabled. Resolve unmapped items above
          before re-running the preview.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Material code</th>
                <th>Description</th>
                <th className="numeric">Qty</th>
                <th>Unit</th>
                <th className="numeric currency">Unit price</th>
                <th className="numeric currency">Line total</th>
              </tr>
            </thead>
            <tbody>
              {mappedLines.map((line, idx) => (
                <tr key={`${line.source_label}-${idx}`}>
                  <td>{line.code ?? '—'}</td>
                  <td>{line.description}</td>
                  <td className="numeric">
                    {line.effective_quantity.toFixed(2)}
                  </td>
                  <td>{line.unit}</td>
                  <td className="numeric currency">
                    {formatPhp(line.unit_price_cents)}
                  </td>
                  <td className="numeric currency">
                    {formatPhp(line.line_total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EmptyPreview({ hasFile }: { hasFile: boolean }) {
  return (
    <section className="card">
      <div className="card-empty">
        {hasFile
          ? 'Run “Preview import” to see proposed BOM lines.'
          : 'Choose a Togal export to begin.'}
      </div>
    </section>
  )
}

function ConfirmModal({
  lineCount,
  bomLabel,
  onCancel,
  onConfirm,
}: {
  lineCount: number
  bomLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="togal-confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 460,
          width: '100%',
          margin: '0 16px',
        }}
      >
        <div className="card-header">
          <h3 id="togal-confirm-title" className="card-title">
            Confirm commit
          </h3>
        </div>
        <div style={{ padding: 18, fontSize: 14, color: 'var(--color-neutral-700)' }}>
          This will insert <strong>{lineCount}</strong> line
          {lineCount === 1 ? '' : 's'} into BOM <strong>{bomLabel}</strong>.
          Continue?
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '0 18px 18px',
          }}
        >
          <button type="button" onClick={onCancel} style={ghostButtonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={primaryButtonStyle(false)}
            autoFocus
          >
            Commit lines
          </button>
        </div>
      </div>
    </div>
  )
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? 'var(--color-neutral-300)' : 'var(--color-primary)',
    color: 'white',
    border: 'none',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

const ghostButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--color-neutral-700)',
  border: '1px solid var(--color-border)',
  padding: '8px 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}
