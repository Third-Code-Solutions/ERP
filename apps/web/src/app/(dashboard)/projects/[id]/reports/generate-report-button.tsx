'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateThisWeekReport } from './actions'

/**
 * Generates this week's report and opens it. A failed generation says why in
 * plain language instead of leaving the page unchanged.
 */
export function GenerateReportButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function generate() {
    setError(null)
    startTransition(async () => {
      const result = await generateThisWeekReport(projectId)
      if (result.error || !result.id) {
        setError(result.error ?? 'The report could not be generated. Try again.')
        return
      }
      router.push(`/weekly-report/${result.id}`)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        style={{
          padding: '8px 16px',
          borderRadius: '6px',
          fontSize: '0.875rem',
          fontWeight: 600,
          background: 'var(--color-navy-700, #1F3864)',
          color: 'white',
          border: 'none',
          cursor: pending ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {pending ? 'Generating…' : 'Generate this week’s report'}
      </button>
      {error ? (
        <p role="alert" style={{ margin: 0, maxWidth: 320, fontSize: '0.75rem', color: 'var(--color-danger, #b00020)' }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
