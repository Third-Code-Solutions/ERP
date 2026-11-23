'use client'

/**
 * Turnover package controls: attach a document to a slot, and mark the package
 * compiled. Both surface the server action's error in plain language instead
 * of reloading silently. The page renders them only for roles that hold the
 * capability the actions enforce (punchlist.manage).
 */

import React, { useState, useTransition } from 'react'
import {
  attachTurnoverDocument,
  markTurnoverCompiled,
  type TurnoverSlot,
} from '@/app/(dashboard)/projects/[id]/turnover/actions'

const errorStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: '0.75rem',
  color: 'var(--color-danger, #dc2626)',
}

export function TurnoverSlotPicker({
  projectId,
  slot,
  slotLabel,
  currentDocId,
  options,
}: {
  projectId: string
  slot: TurnoverSlot
  slotLabel: string
  currentDocId: string | null
  options: { id: string; file_name: string }[]
}) {
  const [documentId, setDocumentId] = useState(currentDocId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (options.length === 0) {
    return (
      <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-400)' }}>
        No docs yet
      </span>
    )
  }

  function attach() {
    if (!documentId) {
      setError('Choose a document first.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await attachTurnoverDocument(projectId, slot, documentId)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select
          aria-label={`Document for ${slotLabel}`}
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          disabled={pending}
          style={{
            padding: '6px 8px',
            fontSize: '0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            background: 'var(--color-surface)',
            minWidth: 180,
          }}
        >
          <option value="">— Choose document —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.file_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={attach}
          disabled={pending}
          style={{
            padding: '6px 10px',
            fontSize: '0.75rem',
            background: 'var(--color-neutral-100)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {pending ? 'Saving…' : currentDocId ? 'Replace' : 'Attach'}
        </button>
      </div>
      {error ? (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function MarkCompiledButton({
  projectId,
  allAttached,
}: {
  projectId: string
  allAttached: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function compile() {
    if (
      !window.confirm(
        'Mark the turnover package as compiled? Documents cannot be changed afterwards.'
      )
    ) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await markTurnoverCompiled(projectId)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={compile}
        disabled={!allAttached || pending}
        title={!allAttached ? 'Attach all four documents first' : undefined}
        style={{
          background: allAttached ? 'var(--color-navy-700)' : 'var(--color-neutral-200)',
          color: allAttached ? 'white' : 'var(--color-neutral-500)',
          border: 'none',
          borderRadius: 6,
          padding: '9px 16px',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: allAttached && !pending ? 'pointer' : 'not-allowed',
        }}
      >
        {pending ? 'Compiling…' : 'Mark as compiled'}
      </button>
      {error ? (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
