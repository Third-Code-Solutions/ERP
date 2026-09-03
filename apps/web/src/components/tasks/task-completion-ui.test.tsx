import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(dashboard)/tasks/actions', () => ({
  completeTask: vi.fn(),
}))

import {
  CompleteTaskForm,
  completionUiReducer,
  type CompletionUiState,
} from './complete-task-button'
import { TaskRow } from './task-row'

const INITIAL: CompletionUiState = {
  open: true,
  notes: 'Keep this note',
  error: 'Core is unavailable.',
  success: null,
}

describe('daily-task completion experience', () => {
  it('renders a named, labelled, bounded required toolbox form and recoverable alert', () => {
    const markup = renderToStaticMarkup(
      <CompleteTaskForm
        state={INITIAL}
        pending={false}
        requiresNotes
        notePlaceholder="Attendees and topic"
        onOpen={vi.fn()}
        onNotesChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(markup).toContain('for="task-completion-notes"')
    expect(markup).toContain('id="task-completion-notes"')
    expect(markup).toContain('required=""')
    expect(markup).toContain('maxLength="2000"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Core is unavailable.')
    expect(markup).toContain('Keep this note')
  })

  it('renders pending controls as disabled with an announced status', () => {
    const markup = renderToStaticMarkup(
      <CompleteTaskForm
        state={{ ...INITIAL, error: null }}
        pending
        requiresNotes={false}
        notePlaceholder="Optional notes"
        onOpen={vi.fn()}
        onNotesChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )
    expect(markup.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2)
    expect(markup).toContain('Completing task…')
    expect(markup).toContain('role="status"')
  })

  it('announces a direct-completion failure without hiding the retry control', () => {
    const markup = renderToStaticMarkup(
      <CompleteTaskForm
        state={{ ...INITIAL, open: false }}
        pending={false}
        requiresNotes={false}
        notePlaceholder="Optional notes"
        onOpen={vi.fn()}
        onNotesChange={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Core is unavailable.')
    expect(markup).toContain('Mark task complete')
  })

  it('clears stale errors on retry, preserves notes on failure, and resets only on success', () => {
    const retrying = completionUiReducer(INITIAL, { type: 'retry' })
    expect(retrying).toEqual({ ...INITIAL, error: null, success: null })

    const failed = completionUiReducer(retrying, {
      type: 'failure',
      error: 'Still unavailable.',
    })
    expect(failed.notes).toBe('Keep this note')
    expect(failed.open).toBe(true)

    expect(
      completionUiReducer(failed, {
        type: 'success',
        message: 'Task is complete.',
      })
    ).toEqual({
      open: false,
      notes: '',
      error: null,
      success: 'Task is complete.',
    })
  })

  it('shows an accessible read-only state instead of completion controls', () => {
    const markup = renderToStaticMarkup(
      <table><tbody><TaskRow
        readOnly
        task={{
          id: '11111111-1111-4111-8111-111111111111',
          project_id: '22222222-2222-4222-8222-222222222222',
          project_name: 'Site A',
          assignee_id: '33333333-3333-4333-8333-333333333333',
          title: 'Daily site walk',
          description: null,
          role: 'viewer',
          due_date: '2026-09-03T04:00:00.000Z',
          status: 'pending',
        }}
      /></tbody></table>
    )
    expect(markup).toContain('Read-only: completion unavailable for your role.')
    expect(markup).not.toContain('Mark task complete')
  })

  it('mounts the named completion control only when the row is writable', () => {
    const markup = renderToStaticMarkup(
      <table><tbody><TaskRow
        task={{
          id: '11111111-1111-4111-8111-111111111111',
          project_id: '22222222-2222-4222-8222-222222222222',
          project_name: 'Site A',
          assignee_id: '33333333-3333-4333-8333-333333333333',
          title: 'Daily site walk',
          description: null,
          role: 'safety',
          due_date: '2026-09-03T04:00:00.000Z',
          status: 'pending',
        }}
      /></tbody></table>
    )
    expect(markup).toContain('aria-label="Mark task complete"')
    expect(markup).not.toContain('Read-only: completion unavailable for your role.')
  })
})
