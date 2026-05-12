'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeTask } from '@/app/(dashboard)/tasks/actions'

interface CompleteTaskButtonProps {
  taskId: string
}

export function CompleteTaskButton({ taskId }: CompleteTaskButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(includeNotes: boolean) {
    setError(null)
    const payload = includeNotes ? notes.trim() : undefined
    startTransition(async () => {
      const result = await completeTask(taskId, payload)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      setNotes('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={isPending}
          aria-label="Mark task complete"
          style={primaryStyle(isPending)}
        >
          {isPending ? '…' : 'Complete'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={isPending}
          style={secondaryStyle(isPending)}
          title="Complete with note"
        >
          + Note
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional completion notes"
        rows={2}
        autoFocus
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '0.8125rem',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          resize: 'vertical',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>{error}</span>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setNotes('')
            setError(null)
          }}
          disabled={isPending}
          style={secondaryStyle(isPending)}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={isPending}
          style={primaryStyle(isPending)}
        >
          {isPending ? 'Saving…' : 'Complete'}
        </button>
      </div>
    </div>
  )
}

function primaryStyle(isPending: boolean): React.CSSProperties {
  return {
    background: 'var(--color-navy-700)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: isPending ? 'not-allowed' : 'pointer',
    opacity: isPending ? 0.6 : 1,
    whiteSpace: 'nowrap',
  }
}

function secondaryStyle(isPending: boolean): React.CSSProperties {
  return {
    background: 'white',
    color: 'var(--color-neutral-700)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '0.75rem',
    cursor: isPending ? 'not-allowed' : 'pointer',
    opacity: isPending ? 0.6 : 1,
    whiteSpace: 'nowrap',
  }
}
