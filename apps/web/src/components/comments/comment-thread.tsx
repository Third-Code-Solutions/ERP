'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteComment } from '@/app/(dashboard)/projects/[id]/comments/actions'

export interface CommentThreadItem {
  id: string
  authorId: string | null
  authorName: string
  authorEmail: string | null
  body: string
  createdAt: Date | string
}

interface CommentThreadProps {
  projectId: string
  currentUserId: string
  comments: CommentThreadItem[]
}

function formatRelativeTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function authorInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}

export function CommentThread({ projectId, currentUserId, comments }: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <div
        style={{
          background: 'white',
          border: '1px dashed var(--color-border)',
          borderRadius: '8px',
          padding: '32px 20px',
          textAlign: 'center',
          color: 'var(--color-neutral-500)',
          fontSize: '0.875rem',
        }}
      >
        No comments yet. Start the conversation below.
      </div>
    )
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {comments.map((comment) => (
        <CommentRow
          key={comment.id}
          comment={comment}
          projectId={projectId}
          canDelete={comment.authorId === currentUserId}
        />
      ))}
    </ul>
  )
}

function CommentRow({
  comment,
  projectId,
  canDelete,
}: {
  comment: CommentThreadItem
  projectId: string
  canDelete: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    if (!confirm('Delete this comment?')) return
    startTransition(async () => {
      await deleteComment(comment.id, projectId)
      router.refresh()
    })
  }

  return (
    <li
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '14px 16px',
        opacity: isPending ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div
          aria-hidden
          style={{
            width: 32,
            height: 32,
            flex: '0 0 32px',
            borderRadius: '50%',
            background: 'var(--color-neutral-100)',
            color: 'var(--color-navy-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '0.8125rem',
          }}
        >
          {authorInitial(comment.authorName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-900)' }}>
                {comment.authorName}
              </span>
              {comment.authorEmail ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-400)' }}>
                  {comment.authorEmail}
                </span>
              ) : null}
              <span
                title={
                  comment.createdAt instanceof Date
                    ? comment.createdAt.toLocaleString()
                    : new Date(comment.createdAt).toLocaleString()
                }
                style={{ fontSize: '0.75rem', color: 'var(--color-neutral-400)' }}
              >
                · {formatRelativeTime(comment.createdAt)}
              </span>
            </div>
            {canDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                title="Delete comment"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {isPending ? 'Deleting…' : 'Delete'}
              </button>
            ) : null}
          </div>
          <div
            style={{
              fontSize: '0.875rem',
              color: 'var(--color-neutral-800)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5,
            }}
          >
            {comment.body}
          </div>
        </div>
      </div>
    </li>
  )
}
