'use client'

import { useRef } from 'react'
import { IconUpload } from '@/components/ui/icons'
import { CAD_ACCEPT, useCadUpload } from '@/components/cad/use-cad-upload'

interface UploadButtonProps {
  projectId: string
}

export function UploadButton({ projectId }: UploadButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { isPending, progress, error, upload, reset } = useCadUpload({ projectId })

  function handleClick() {
    reset()
    fileRef.current?.click()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    upload(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <input
        ref={fileRef}
        type="file"
        accept={CAD_ACCEPT}
        data-testid="documents-file-input"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={handleClick}
        data-testid="documents-upload-trigger"
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--color-navy-700)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '-0.005em',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
          transition: 'background var(--duration-fast)',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
        }}
      >
        <IconUpload size={14} />
        <span>{isPending ? 'Uploading…' : 'Upload file'}</span>
      </button>
      {progress ? (
        <span role="status" style={{ fontSize: 12.5, color: 'var(--color-navy-700)' }}>{progress}</span>
      ) : null}
      {error ? (
        <span role="alert" style={{ fontSize: 12.5, color: 'var(--color-danger)' }}>{error}</span>
      ) : null}
    </div>
  )
}
