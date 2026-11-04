'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { ActionFeedback } from '@/components/ui/action-feedback'
import { useDialogFocus } from '@/components/ui/use-dialog-focus'
import { createTask } from './actions'
import styles from './tasks.module.css'

export interface TaskProjectOption {
  id: string
  name: string
}

export interface TaskAssigneeOption {
  id: string
  fullName: string
  roleLabel: string
}

interface NewTaskDialogProps {
  projects: TaskProjectOption[]
  assignees: TaskAssigneeOption[]
  /** datetime-local value (Manila) used as the default due time. */
  defaultDueAt: string
  defaultAssigneeId?: string
  defaultProjectId?: string
}

const ERROR_ID = 'new-task-error'

export function NewTaskDialog({
  projects,
  assignees,
  defaultDueAt,
  defaultAssigneeId,
  defaultProjectId,
}: NewTaskDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const titleRef = useRef<HTMLInputElement>(null)
  const pressStartedOnBackdrop = useRef(false)
  const dialogRef = useDialogFocus<HTMLFormElement>(open, titleRef)
  const canSubmit = projects.length > 0 && assignees.length > 0

  function close() {
    if (isPending) return
    setOpen(false)
    setError(null)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      try {
        const result = await createTask(data)
        if (result.error) {
          setError(result.error)
          // The submit button was disabled mid-request; keep focus inside the dialog.
          dialogRef.current?.focus()
          return
        }
        setOpen(false)
        setSuccess(result.message ?? 'Task created.')
      } catch {
        setError('The task could not be created. Please try again.')
        dialogRef.current?.focus()
      }
    })
  }

  return (
    <div className={styles.headerAction}>
      <button
        type="button"
        className="button-primary"
        onClick={() => {
          setSuccess(null)
          setOpen(true)
        }}
      >
        + New task
      </button>
      <ActionFeedback success={success} />

      {open && (
        <div
          className={styles.backdrop}
          onMouseDown={(event) => {
            pressStartedOnBackdrop.current = event.target === event.currentTarget
          }}
          onClick={(event) => {
            // A text selection dragged out of a field must not discard the form.
            if (pressStartedOnBackdrop.current && event.target === event.currentTarget) close()
            pressStartedOnBackdrop.current = false
          }}
        >
          <form
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-task-title"
            aria-describedby={error ? ERROR_ID : undefined}
            tabIndex={-1}
            className={styles.dialog}
            onSubmit={handleSubmit}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.stopPropagation()
              close()
            }}
          >
            <div>
              <h2 id="new-task-title" className={styles.dialogTitle}>New task</h2>
              <p className={styles.dialogIntro}>
                Assign a one-off task to a teammate. It appears in their task list right away.
              </p>
            </div>

            <div className={styles.fields}>
              <div className="form-row">
                <label className="form-label" htmlFor="new-task-title-input">Title</label>
                <input
                  ref={titleRef}
                  id="new-task-title-input"
                  name="title"
                  className="form-input"
                  required
                  maxLength={255}
                  placeholder="e.g. Confirm ceiling board delivery for Level 3"
                />
              </div>

              <div className="form-row-2col">
                <div>
                  <label className="form-label" htmlFor="new-task-project">Project</label>
                  <select
                    id="new-task-project"
                    name="project_id"
                    className="form-input"
                    required
                    defaultValue={defaultProjectId && projects.some((p) => p.id === defaultProjectId) ? defaultProjectId : ''}
                  >
                    <option value="" disabled>Choose a project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="new-task-assignee">Assignee</label>
                  <select
                    id="new-task-assignee"
                    name="assignee_id"
                    className="form-input"
                    required
                    defaultValue={defaultAssigneeId && assignees.some((a) => a.id === defaultAssigneeId) ? defaultAssigneeId : ''}
                  >
                    <option value="" disabled>Choose a teammate</option>
                    {assignees.map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>
                        {assignee.fullName} · {assignee.roleLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <label className="form-label" htmlFor="new-task-due">Due</label>
                <input
                  id="new-task-due"
                  name="due_at"
                  type="datetime-local"
                  className="form-input"
                  required
                  defaultValue={defaultDueAt}
                  aria-describedby="new-task-due-help"
                />
                <p id="new-task-due-help" className="form-help">Manila time (UTC+8).</p>
              </div>

              <div className="form-row">
                <label className="form-label" htmlFor="new-task-description">Description (optional)</label>
                <textarea
                  id="new-task-description"
                  name="description"
                  className="form-input"
                  maxLength={2_000}
                  rows={3}
                  placeholder="What needs to happen and what done looks like"
                />
              </div>

              {!canSubmit && (
                <p className="form-warning">
                  {projects.length === 0
                    ? 'There are no open projects to add a task to.'
                    : 'No active teammates can be assigned tasks yet.'}
                </p>
              )}
            </div>

            <ActionFeedback id={ERROR_ID} error={error} pending={isPending} pendingMessage="Creating task…" />

            <div className={styles.dialogActions}>
              <button type="button" className="button-secondary" onClick={close} disabled={isPending}>
                Cancel
              </button>
              <button type="submit" className="button-primary" disabled={isPending || !canSubmit}>
                {isPending ? 'Creating…' : 'Create task'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
