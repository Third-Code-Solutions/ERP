'use client'

// Photo attach form for a punchlist item. We deliberately do NOT reinvent
// the 3-step upload pipeline; the user uploads the photo via the project
// Documents tab first, then pastes (or chooses) the document_id here.
// Once Track 4 ships a generic doc-picker we can swap that in.

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { addPunchlistPhoto } from '@/app/(dashboard)/punchlist/actions'

interface PhotoRow {
  id: string
  document_id: string
  file_name: string
  mime_type: string
  caption: string | null
  is_before: boolean
  created_at: Date
}

// Formats every browser can draw; HEIC and the like fall back to a plain link.
const THUMBNAIL_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

interface AvailableDoc {
  id: string
  file_name: string
}

interface Props {
  itemId: string
  projectId: string
  photos: PhotoRow[]
  availableDocs: AvailableDoc[]
  canEdit: boolean
}

export function PunchlistPhotos({
  itemId,
  projectId,
  photos,
  availableDocs,
  canEdit,
}: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const before = photos.filter((p) => p.is_before)
  const after = photos.filter((p) => !p.is_before)
  const atLimit = photos.length >= 5

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    data.set('punchlist_item_id', itemId)
    startTransition(async () => {
      const res = await addPunchlistPhoto(data)
      if (res?.error) {
        setError(res.error)
      } else {
        ;(e.target as HTMLFormElement).reset()
        router.refresh()
      }
    })
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 8px',
    fontSize: '0.8125rem',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    background: 'var(--color-surface)',
  }

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3
          style={{
            margin: 0,
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--color-neutral-900)',
          }}
        >
          Photos
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)' }}>
          {photos.length} / 5
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <PhotoColumn title="Before" photos={before} />
        <PhotoColumn title="After" photos={after} />
      </div>

      {canEdit && !atLimit ? (
        availableDocs.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: '10px 12px',
              background: 'var(--color-neutral-50)',
              borderRadius: 6,
              fontSize: '0.75rem',
              color: 'var(--color-neutral-600)',
            }}
          >
            Upload photos to the{' '}
            <Link
              href={`/projects/${projectId}/documents`}
              style={{ color: 'var(--color-navy-text)' }}
            >
              Documents
            </Link>{' '}
            tab first, then attach them here.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr auto',
              gap: 8,
              alignItems: 'end',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-neutral-500)' }}>
                Document
              </span>
              <select name="document_id" required style={inputStyle}>
                <option value="">Choose photo…</option>
                {availableDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.file_name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-neutral-500)' }}>
                When
              </span>
              <select name="is_before" defaultValue="true" style={inputStyle}>
                <option value="true">Before</option>
                <option value="false">After</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-neutral-500)' }}>
                Caption (optional)
              </span>
              <input name="caption" type="text" maxLength={255} style={inputStyle} />
            </label>
            <button
              type="submit"
              disabled={isPending}
              style={{
                background: 'var(--color-navy-700)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                padding: '8px 14px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: isPending ? 'wait' : 'pointer',
              }}
            >
              {isPending ? 'Attaching…' : 'Attach'}
            </button>
          </form>
        )
      ) : null}

      {atLimit ? (
        <p
          style={{
            margin: 0,
            fontSize: '0.75rem',
            color: 'var(--color-neutral-500)',
          }}
        >
          Maximum of 5 photos reached.
        </p>
      ) : null}

      {error ? (
        <div
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '8px 10px',
            borderRadius: 6,
            fontSize: '0.75rem',
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  )
}

function PhotoColumn({ title, photos }: { title: string; photos: PhotoRow[] }) {
  return (
    <div>
      <h4
        style={{
          margin: '0 0 8px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {title} ({photos.length})
      </h4>
      {photos.length === 0 ? (
        <div
          style={{
            border: '1px dashed var(--color-border)',
            borderRadius: 6,
            padding: 20,
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--color-neutral-400)',
          }}
        >
          No {title.toLowerCase()} photos
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {photos.map((p) => (
            <li
              key={p.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                fontSize: '0.8125rem',
              }}
            >
              {/* Authenticated, tenant-scoped route that redirects to a short-lived signed URL. */}
              <a
                href={`/api/documents/${p.document_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                {THUMBNAIL_MIME_TYPES.has(p.mime_type) ? (
                  // The src is the authenticated documents route (a redirect to a signed URL),
                  // which next/image cannot optimise.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/documents/${p.document_id}`}
                    alt={p.caption ?? p.file_name}
                    loading="lazy"
                    width={56}
                    height={56}
                    style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                  />
                ) : null}
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontWeight: 500,
                      color: 'var(--color-navy-text)',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {p.file_name}
                  </span>
                  {p.caption ? (
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        color: 'var(--color-neutral-500)',
                      }}
                    >
                      {p.caption}
                    </span>
                  ) : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
