'use client'

import { useState, useTransition } from 'react'
import type { ProcessTaskQueueStatus } from '@third-code-erp/shared-types'
import { updateProcessTaskStatus } from './actions'

type TaskActionStatus =
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled'

interface TaskAction {
  status: TaskActionStatus
  label: string
}

const VALID_TRANSITIONS: Record<
  ProcessTaskQueueStatus,
  readonly TaskAction[]
> = {
  pending: [
    { status: 'in_progress', label: 'Start' },
    { status: 'blocked', label: 'Block' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  in_progress: [
    { status: 'blocked', label: 'Block' },
    { status: 'completed', label: 'Complete' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  blocked: [
    { status: 'in_progress', label: 'Resume' },
    { status: 'cancelled', label: 'Cancel' },
  ],
  completed: [],
  cancelled: [],
}

interface ProcessTaskActionsProps {
  taskId: string
  status: ProcessTaskQueueStatus
}

export function ProcessTaskActions({
  taskId,
  status,
}: ProcessTaskActionsProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const actions = VALID_TRANSITIONS[status]

  function submit(formData: FormData): void {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await updateProcessTaskStatus(formData)
      if (!result.ok) {
        setError(result.error ?? 'Process task status was not updated.')
        return
      }
      setSuccess('Updated')
    })
  }

  if (actions.length === 0 && !error && !success) {
    return <span className="muted">No actions</span>
  }

  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 150 }}>
      {actions.map((action) => (
        <form key={action.status} action={submit}>
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="status" value={action.status} />
          {action.status === 'completed' || action.status === 'cancelled' ? (
            <p className="form-help" style={{ margin: '0 0 4px' }}>
              This closes any active SLA clock for the task.
            </p>
          ) : null}
          {action.status === 'blocked' ? (
            <label
              className="form-label"
              htmlFor={`process-task-blocked-reason-${taskId}`}
            >
              Blocked reason
              <input
                id={`process-task-blocked-reason-${taskId}`}
                className="form-input"
                name="blockedReason"
                type="text"
                required
                maxLength={2000}
                placeholder="Reason required"
                disabled={pending}
              />
            </label>
          ) : null}
          <button
            type="submit"
            className="button-secondary"
            disabled={pending}
          >
            {pending ? 'Saving…' : action.label}
          </button>
        </form>
      ))}
      {error ? (
        <p
          role="alert"
          aria-live="polite"
          style={{ margin: 0, color: 'var(--color-danger)' }}
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" aria-live="polite" style={{ margin: 0 }}>
          {success}
        </p>
      ) : null}
    </div>
  )
}
