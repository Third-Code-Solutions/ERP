'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteDocument } from '@/app/(dashboard)/projects/[id]/documents/actions'

interface DeleteDocumentButtonProps {
  documentId: string
  projectId: string
  fileName: string
}

export function DeleteDocumentButton({
  documentId,
  projectId,
  fileName,
}: DeleteDocumentButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const router = useRouter()
  const idempotencyKeyRef = useRef<string | null>(null)

  function handleDelete() {
    if (!confirm(`Delete "${fileName}"? This removes the file from storage and cannot be undone.`)) {
      return
    }
    setError('')
    startTransition(async () => {
      const fd = new FormData()
      fd.append('document_id', documentId)
      fd.append('project_id', projectId)
      idempotencyKeyRef.current ??= crypto.randomUUID()
      fd.append('idempotency_key', idempotencyKeyRef.current)
      const result = await deleteDocument(fd)
      if (!result.ok) {
        setError(result.error ?? 'Delete failed')
        return
      }
      idempotencyKeyRef.current = null
      router.refresh()
    })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        aria-label={`Delete ${fileName}`}
        title="Delete file"
        style={{
          width: 28,
          height: 28,
          display: 'grid',
          placeItems: 'center',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 6,
          color: 'var(--color-neutral-400)',
          cursor: isPending ? 'wait' : 'pointer',
          opacity: isPending ? 0.5 : 1,
          transition: 'background var(--duration-fast), color var(--duration-fast), border-color var(--duration-fast)',
        }}
        onMouseEnter={(e) => {
          if (isPending) return
          e.currentTarget.style.background = 'var(--color-danger-soft)'
          e.currentTarget.style.color = 'var(--color-danger)'
          e.currentTarget.style.borderColor = 'var(--color-danger-soft)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--color-neutral-400)'
          e.currentTarget.style.borderColor = 'transparent'
        }}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
        </svg>
      </button>
      {error ? (
        <span
          style={{ fontSize: 11.5, color: 'var(--color-danger)', whiteSpace: 'nowrap' }}
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </span>
  )
}
