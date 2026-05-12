'use client'

import { useSearchParams } from 'next/navigation'

interface ExportCsvButtonProps {
  /** Optional override stage filter; otherwise reads `?stage=` from URL. */
  stage?: string
}

export function ExportCsvButton({ stage }: ExportCsvButtonProps) {
  const search = useSearchParams()
  const params = new URLSearchParams()
  const since = search?.get('since')
  const until = search?.get('until')
  const stageParam = stage ?? search?.get('stage') ?? undefined

  if (since) params.set('since', since)
  if (until) params.set('until', until)
  if (stageParam) params.set('stage', stageParam)

  const href = `/api/exports/opportunities-csv${
    params.toString() ? `?${params.toString()}` : ''
  }`

  return (
    <a
      href={href}
      download
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 6,
        background: '#1F3864',
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 500,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
      aria-label="Export opportunities to CSV"
    >
      <span aria-hidden>↓</span>
      Export CSV
    </a>
  )
}
