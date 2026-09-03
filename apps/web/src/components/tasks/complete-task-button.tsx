'use client'

import React, { useReducer, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ActionResult } from '@/app/(dashboard)/tasks/actions'

interface CompleteTaskButtonProps {
  action: (formData: FormData) => Promise<ActionResult>
  taskId: string
  requiresNotes: boolean
  notePlaceholder?: string
}

export interface CompletionUiState {
  open: boolean
  notes: string
  error: string | null
  success: string | null
}

type CompletionUiAction =
  | { type: 'open' }
  | { type: 'notes'; notes: string }
  | { type: 'cancel' }
  | { type: 'retry' }
  | { type: 'failure'; error: string }
  | { type: 'success'; message: string }

const INITIAL_STATE: CompletionUiState = {
  open: false,
  notes: '',
  error: null,
  success: null,
}

export function completionUiReducer(
  state: CompletionUiState,
  action: CompletionUiAction
): CompletionUiState {
  switch (action.type) {
    case 'open':
      return { ...state, open: true, error: null, success: null }
    case 'notes':
      return { ...state, notes: action.notes }
    case 'cancel':
      return INITIAL_STATE
    case 'retry':
      return { ...state, error: null, success: null }
    case 'failure':
      return { ...state, error: action.error, success: null }
    case 'success':
      return {
        open: false,
        notes: '',
        error: null,
        success: action.message,
      }
  }
}

interface CompleteTaskFormProps {
  state: CompletionUiState
  pending: boolean
  requiresNotes: boolean
  notePlaceholder: string
  notesId?: string
  onOpen: () => void
  onNotesChange: (notes: string) => void
  onCancel: () => void
  onSubmit: (includeNotes: boolean) => void
}

export function CompleteTaskForm({
  state,
  pending,
  requiresNotes,
  notePlaceholder,
  notesId = 'task-completion-notes',
  onOpen,
  onNotesChange,
  onCancel,
  onSubmit,
}: CompleteTaskFormProps) {
  const feedbackId = `${notesId}-feedback`

  if (!state.open) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {!requiresNotes && (
            <button
              type="button"
              onClick={() => onSubmit(false)}
              disabled={pending}
              aria-label="Mark task complete"
              aria-describedby={state.success || state.error ? feedbackId : undefined}
              style={primaryStyle(pending)}
            >
              {pending ? 'Completing…' : 'Complete'}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            disabled={pending}
            style={secondaryStyle(pending)}
            title={requiresNotes ? 'Record required log notes' : 'Complete with note'}
          >
            {requiresNotes ? 'Log meeting' : '+ Note'}
          </button>
        </div>
        {pending && (
          <span id={feedbackId} role="status" className="muted" style={{ fontSize: '0.75rem' }}>
            Completing task…
          </span>
        )}
        {state.success && !pending && (
          <span id={feedbackId} role="status" className="muted" style={{ fontSize: '0.75rem' }}>
            {state.success}
          </span>
        )}
        {state.error && !pending && (
          <span id={feedbackId} role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>
            {state.error}
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240 }}>
      <label htmlFor={notesId} style={{ fontSize: '0.75rem', fontWeight: 600 }}>
        {requiresNotes ? 'Toolbox meeting notes' : 'Completion notes (optional)'}
      </label>
      <textarea
        id={notesId}
        value={state.notes}
        onChange={(event) => onNotesChange(event.target.value)}
        placeholder={notePlaceholder}
        rows={2}
        required={requiresNotes}
        maxLength={2_000}
        aria-describedby={state.error || pending ? feedbackId : undefined}
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
      {state.error && (
        <span id={feedbackId} role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>
          {state.error}
        </span>
      )}
      {pending && (
        <span id={feedbackId} role="status" className="muted" style={{ fontSize: '0.75rem' }}>
          Completing task…
        </span>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          style={secondaryStyle(pending)}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(true)}
          disabled={pending}
          style={primaryStyle(pending)}
        >
          {pending ? 'Completing…' : 'Complete'}
        </button>
      </div>
    </div>
  )
}

export function CompleteTaskButton({
  action,
  taskId,
  requiresNotes,
  notePlaceholder = 'Optional completion notes',
}: CompleteTaskButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [state, dispatch] = useReducer(completionUiReducer, INITIAL_STATE)
  const inFlight = useRef(false)

  function submit(includeNotes: boolean) {
    if (inFlight.current) return
    dispatch({ type: 'retry' })
    if (requiresNotes && state.notes.trim().length === 0) {
      dispatch({ type: 'failure', error: 'Toolbox meeting log requires notes.' })
      return
    }

    inFlight.current = true
    const formData = new FormData()
    if (includeNotes) formData.set('notes', state.notes)

    startTransition(async () => {
      try {
        const result = await action(formData)
        if (result.error) {
          dispatch({ type: 'failure', error: result.error })
          return
        }
        dispatch({
          type: 'success',
          message: result.message ?? 'Task is complete.',
        })
        router.refresh()
      } catch {
        dispatch({
          type: 'failure',
          error: 'Daily task completion is unavailable. Please try again.',
        })
      } finally {
        inFlight.current = false
      }
    })
  }

  return (
    <CompleteTaskForm
      state={state}
      pending={isPending}
      requiresNotes={requiresNotes}
      notePlaceholder={notePlaceholder}
      notesId={`task-completion-notes-${taskId}`}
      onOpen={() => dispatch({ type: 'open' })}
      onNotesChange={(notes) => dispatch({ type: 'notes', notes })}
      onCancel={() => dispatch({ type: 'cancel' })}
      onSubmit={submit}
    />
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
