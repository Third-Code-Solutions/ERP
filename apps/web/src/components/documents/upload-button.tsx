'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface UploadButtonProps {
  projectId: string
}

const ACCEPT = '.dxf,.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls'

export function UploadButton({ projectId }: UploadButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const router = useRouter()

  function handleClick() {
    setError('')
    fileRef.current?.click()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setProgress('Uploading…')
    setError('')

    startTransition(async () => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_id', projectId)

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error ?? 'Upload failed')
          setProgress('')
          return
        }

        if (data.documentType === 'dxf') {
          setProgress('DXF queued for parsing…')
        } else {
          setProgress('')
        }

        router.refresh()
      } catch {
        setError('Network error — please try again')
        setProgress('')
      }

      // Reset input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <button
        onClick={handleClick}
        disabled={isPending}
        style={{
          background: 'var(--color-navy-700)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '7px 16px',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? 'Uploading…' : '↑ Upload File'}
      </button>
      {progress && (
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-navy-700)' }}>{progress}</span>
      )}
      {error && (
        <span style={{ fontSize: '0.8125rem', color: '#ef4444' }}>{error}</span>
      )}
    </div>
  )
}
