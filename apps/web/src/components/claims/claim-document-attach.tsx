'use client'

/**
 * ClaimDocumentAttach — inline form on the claim detail page to attach an
 * existing document (by UUID) as a photo / certificate / measurement / other
 * artefact of this claim. Documents must already exist in the tenant; this
 * component is the seam between the document module and the claim flow.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { attachClaimDocument } from '@/app/(dashboard)/claims/[id]/actions'

const KIND_OPTIONS = [
  { value: 'photo', label: 'Photo' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'measurement', label: 'Measurement' },
  { value: 'other', label: 'Other' },
] as const

type Kind = (typeof KIND_OPTIONS)[number]['value']

interface ClaimDocumentAttachProps {
  claimId: string
  disabled?: boolean
}

export function ClaimDocumentAttach({ claimId, disabled }: ClaimDocumentAttachProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [documentId, setDocumentId] = useState('')
  const [kind, setKind] = useState<Kind>('photo')
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!documentId.trim()) {
      setError('Document UUID is required')
      return
    }
    startTransition(async () => {
      const res = await attachClaimDocument(
        claimId,
        documentId.trim(),
        kind,
        caption.trim() || undefined
      )
      if (res.error) {
        setError(res.error)
        return
      }
      setSuccess('Document attached.')
      setDocumentId('')
      setCaption('')
      setKind('photo')
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Attach document
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 8 }}>
        <input
          type="text"
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          placeholder="Document UUID"
          disabled={disabled || isPending}
          style={inputStyle}
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          disabled={disabled || isPending}
          style={inputStyle}
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption (optional)"
        maxLength={255}
        disabled={disabled || isPending}
        style={inputStyle}
      />

      <button
        type="submit"
        disabled={disabled || isPending || !documentId.trim()}
        style={{
          background: '#0F2D4A',
          color: 'white',
          border: '1px solid #0F2D4A',
          borderRadius: 6,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled || isPending ? 'not-allowed' : 'pointer',
          opacity: disabled || isPending ? 0.6 : 1,
        }}
      >
        {isPending ? 'Attaching…' : 'Attach document'}
      </button>

      {error && (
        <div
          style={{
            background: '#fef3f2',
            color: '#b42318',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12.5,
          }}
        >
          {error}
        </div>
      )}
      {success && !error && (
        <div
          style={{
            background: '#ecfdf5',
            color: '#15803d',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12.5,
          }}
        >
          {success}
        </div>
      )}
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  background: 'white',
  fontFamily: 'inherit',
}
