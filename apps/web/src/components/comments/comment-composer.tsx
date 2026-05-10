'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createComment } from '@/app/(dashboard)/projects/[id]/comments/actions'

interface CommentComposerProps {
  projectId: string
}

export function CommentComposer({ projectId }: CommentComposerProps) {
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  const trimmed = body.trim()
  const isEmpty = trimmed.length === 0
  const isDisabled = isEmpty || isPending

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isDisabled) return
    setError('')
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createComment(projectId, data)
      if (result.error) {
        setError(result.error)
        return
      }
      setBody('')
      formRef.current?.reset()
      router.refresh()
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '12px 12px 10px',
      }}
    >
      <label htmlFor="comment-body" style={{ display: 'none' }}>
        Add a comment
      </label>
      <textarea
        id="comment-body"
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment. Use @email@example.com to mention teammates."
        rows={3}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          resize: 'vertical',
          minHeight: '64px',
          fontFamily: 'inherit',
          fontSize: '0.875rem',
          color: 'var(--color-neutral-900)',
          background: 'transparent',
          padding: '4px 6px',
          boxSizing: 'border-box',
          lineHeight: 1.5,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingTop: '8px',
          borderTop: '1px solid var(--color-border)',
          marginTop: '6px',
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            color: error ? '#ef4444' : 'var(--color-neutral-400)',
          }}
        >
          {error || 'Markdown not supported. Line breaks are preserved.'}
        </span>
        <button
          type="submit"
          disabled={isDisabled}
          style={{
            background: isDisabled ? 'var(--color-neutral-200)' : 'var(--color-navy-700)',
            color: isDisabled ? 'var(--color-neutral-500)' : 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '7px 16px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  )
}
