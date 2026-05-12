'use client'

/**
 * Master schedule CSV import (US-Con-003 #2).
 *
 * Client component that reads a CSV file on the client and posts its text
 * content to the importMasterSchedule server action. Avoids multipart
 * uploads — the file is small (≤ a few hundred rows) and parsing happens
 * server-side.
 */

import { useState, useTransition } from 'react'
import { importMasterSchedule } from '@/app/(dashboard)/projects/[id]/progress/actions'

interface Props {
  projectId: string
  hasExisting: boolean
}

export function MasterScheduleImport({ projectId, hasExisting }: Props) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleFile(file: File) {
    setError(null)
    setSuccess(null)
    setFileName(file.name)
    const text = await file.text()
    startTransition(async () => {
      const res = await importMasterSchedule(projectId, text)
      if (res.error) {
        setError(res.error)
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
          {pending ? 'Importing…' : hasExisting ? 'Replace schedule (CSV)' : 'Import schedule (CSV)'}
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
    </div>
  )
}
