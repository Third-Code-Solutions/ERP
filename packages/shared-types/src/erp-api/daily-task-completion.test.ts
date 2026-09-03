import { describe, expect, it } from 'vitest'
import {
  dailyTaskCompletionCommandSchema,
  dailyTaskCompletionResultSchema,
} from './daily-task-completion'

const TASK_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ASSIGNEE_ID = '44444444-4444-4444-8444-444444444444'
const COMPLETER_ID = '55555555-5555-4555-8555-555555555555'

describe('daily task completion Core contract', () => {
  it('normalizes meaningful notes and treats blank notes as absent', () => {
    expect(
      dailyTaskCompletionCommandSchema.parse({ notes: '  Completed safely  ' })
    ).toEqual({ notes: 'Completed safely' })
    expect(dailyTaskCompletionCommandSchema.parse({ notes: '   ' })).toEqual({})
    expect(dailyTaskCompletionCommandSchema.parse({})).toEqual({})
  })

  it('rejects unknown identity, workflow, and overlong fields', () => {
    for (const value of [
      { tenantId: TENANT_ID },
      { actorId: COMPLETER_ID },
      { assigneeId: ASSIGNEE_ID },
      { role: 'owner' },
      { status: 'done' },
      { notes: 'x'.repeat(2001) },
      { notes: 42 },
    ]) {
      expect(() => dailyTaskCompletionCommandSchema.parse(value)).toThrow()
    }
  })

  it('accepts only a canonical persisted done result', () => {
    const result = {
      ok: true,
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      assigneeId: ASSIGNEE_ID,
      status: 'done',
      completionNotes: 'Completed safely',
      completedAt: '2026-09-03T04:00:00.000Z',
      completedBy: COMPLETER_ID,
    }
    expect(dailyTaskCompletionResultSchema.parse(result)).toEqual(result)
    expect(() =>
      dailyTaskCompletionResultSchema.parse({ ...result, status: 'pending' })
    ).toThrow()
    expect(() =>
      dailyTaskCompletionResultSchema.parse({ ...result, completedAt: null })
    ).toThrow()
    expect(() =>
      dailyTaskCompletionResultSchema.parse({ ...result, extra: true })
    ).toThrow()
  })
})
