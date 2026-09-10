'use client'

/**
 * Master schedule CSV import (US-Con-003 #2).
 *
 * Client component that reads a CSV file on the client and posts its text
 * content to the importMasterSchedule server action. Avoids multipart
 * uploads — the file is small (≤ a few hundred rows) and parsing happens
 * server-side.
 */

import React, { useState, useTransition } from 'react'
import {
  importMasterSchedule,
  previewMasterSchedule,
  type MasterScheduleImportPreview,
} from '@/app/(dashboard)/projects/[id]/progress/actions'

interface Props {
  projectId: string
  hasExisting: boolean
}

export function MasterScheduleImport({ projectId, hasExisting }: Props) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [csvText, setCsvText] = useState<string | null>(null)
  const [preview, setPreview] = useState<MasterScheduleImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleFile(file: File) {
    setError(null)
    setSuccess(null)
    setPreview(null)
    setFileName(file.name)
    const text = await file.text()
    setCsvText(text)
    startTransition(async () => {
      const res = await previewMasterSchedule(projectId, text)
      if (!res.preview) {
        setError(res.error ?? 'Schedule preview could not be created.')
      } else {
        setPreview(res.preview)
        if (res.preview.rejectedRows.length > 0) {
          setError('Fix rejected rows before replacing the existing schedule.')
        } else {
          setSuccess(`${res.preview.tasks.length} task(s) ready to import.`)
        }
      }
    })
  }

  function confirmImport() {
    if (!csvText || !preview || preview.rejectedRows.length > 0) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await importMasterSchedule(projectId, csvText)
      if (res.error) {
        setError(res.error)
        if (res.preview) setPreview(res.preview)
      } else {
        setSuccess(`Imported ${res.taskCount ?? 0} tasks.`)
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-neutral-600)' }}>
        CSV format:{' '}
        <code
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11.5,
            background: 'var(--color-neutral-50)',
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          name,start_date,finish_date,predecessor_index,planned_pct_curve
        </code>
        . The last column is a JSON array of weekly cumulative %.
      </p>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          border: '1px dashed var(--color-border)',
          borderRadius: 6,
          background: 'var(--color-neutral-50)',
          cursor: pending ? 'wait' : 'pointer',
          fontSize: 13,
          color: 'var(--color-neutral-700)',
          alignSelf: 'flex-start',
        }}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
          style={{ display: 'none' }}
        />
        <span style={{ fontWeight: 500 }}>
          {pending ? 'Checking…' : 'Choose schedule CSV'}
        </span>
        {fileName && (
          <span style={{ color: 'var(--color-neutral-500)', fontSize: 12 }}>
            · {fileName}
          </span>
        )}
      </label>

      {error && (
        <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>
      )}
      {success && (
        <p style={{ margin: 0, color: 'var(--color-success)', fontSize: 12 }}>{success}</p>
      )}
      {preview && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            background: 'var(--color-background)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Preview: {preview.tasks.length} valid task(s), {preview.rejectedRows.length} rejected row(s)
          </div>
          {preview.rejectedRows.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--color-danger)', fontSize: 12 }}>
              {preview.rejectedRows.map((row) => <li key={`${row.row}-${row.reason}`}>Row {row.row}: {row.reason}</li>)}
            </ul>
          )}
          {preview.rejectedRows.length === 0 && (
            <>
              {hasExisting && <p style={{ margin: 0, color: 'var(--color-warning)', fontSize: 12 }}>This will replace the current schedule after the validated preview.</p>}
              <button
                type="button"
                onClick={confirmImport}
                disabled={pending}
                style={{ alignSelf: 'flex-start' }}
              >
                {pending ? 'Importing…' : hasExisting ? 'Replace schedule' : 'Import schedule'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
