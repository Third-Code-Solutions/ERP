import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { ERP_ROLES, type ErpRole } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => {
  const insertedValues: unknown[] = []
  const tx = {
    insert: () => ({
      values: (row: unknown) => {
        insertedValues.push(row)
        return { returning: () => Promise.resolve([{ id: 'new-task-id' }]) }
      },
    }),
  }
  return {
    requireUserProfile: vi.fn(),
    revalidatePath: vi.fn(),
    dailyTaskCompletionWritesUseCoreApi: vi.fn(),
    completeDailyTaskThroughCoreApi: vi.fn(),
    writeAuditLog: vi.fn(),
    writeAuditLogInTransaction: vi.fn(),
    generateTasksForDate: vi.fn(),
    selectResults: [] as unknown[][],
    selectWheres: [] as unknown[],
    insertedValues,
    transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
    info: vi.fn(),
  }
})

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

vi.mock('@third-code-erp/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@third-code-erp/auth')>()
  return { ...actual, requireUserProfile: mocks.requireUserProfile }
})

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          mocks.selectWheres.push(condition)
          return { limit: () => Promise.resolve(mocks.selectResults.shift() ?? []) }
        },
      }),
    }),
    transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/audit', () => ({
  stampActorInTransaction: vi.fn(),
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))
vi.mock('@/lib/operations/cadence-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/operations/cadence-engine')>()),
  generateTasksForDate: mocks.generateTasksForDate,
}))
vi.mock('@/lib/erp-core-client', () => ({
  dailyTaskCompletionWritesUseCoreApi:
    mocks.dailyTaskCompletionWritesUseCoreApi,
  completeDailyTaskThroughCoreApi: mocks.completeDailyTaskThroughCoreApi,
}))

import {
  completeTask,
  createTask,
  triggerDailyGeneration,
  type CompleteTaskContext,
} from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const COMPLETED_AT = '2026-09-03T04:00:00.000Z'

const CONTEXT: CompleteTaskContext = {
  taskId: TASK_ID,
  projectId: PROJECT_ID,
  assigneeId: USER_ID,
  requiresNotes: false,
}

function form(notes?: string): FormData {
  const result = new FormData()
  if (notes !== undefined) result.set('notes', notes)
  return result
}

function coreResult(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      ok: true as const,
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      assigneeId: USER_ID,
      status: 'done' as const,
      completionNotes: null,
      completedAt: COMPLETED_AT,
      completedBy: USER_ID,
      ...overrides,
    },
  }
}

function latestEvent(): Record<string, unknown> {
  const call = mocks.info.mock.calls.at(-1)
  expect(call?.[0]).toBe('[daily-task-completion]')
  return call?.[1] as Record<string, unknown>
}

describe('completeTask Core-only authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(mocks.info)
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'safety',
      email: 'safety@example.test',
      fullName: 'Safety User',
    })
    mocks.dailyTaskCompletionWritesUseCoreApi.mockReturnValue(true)
    mocks.completeDailyTaskThroughCoreApi.mockResolvedValue(coreResult())
  })

  it.each(ERP_ROLES)(
    'projects the central daily-task capability for %s before Core',
    async (role: ErpRole) => {
      mocks.requireUserProfile.mockResolvedValue({
        user: { id: USER_ID },
        tenantId: TENANT_ID,
        role,
        email: `${role}@example.test`,
        fullName: role,
      })

      const result = await completeTask(CONTEXT, form())
      const allowed = ['owner', 'admin', 'sd_pm_pe', 'pm', 'safety'].includes(role)

      expect(result).toEqual(
        allowed
          ? { ok: true, message: 'Task is complete.' }
          : { error: 'Forbidden' }
      )
      expect(mocks.completeDailyTaskThroughCoreApi).toHaveBeenCalledTimes(
        allowed ? 1 : 0
      )
    }
  )

  it('rejects unauthenticated direct action invocation before selection or Core', async () => {
    mocks.requireUserProfile.mockRejectedValue(new Error('no session'))

    await expect(completeTask(CONTEXT, form())).resolves.toEqual({
      error: 'Unauthorized',
    })
    expect(mocks.dailyTaskCompletionWritesUseCoreApi).not.toHaveBeenCalled()
    expect(mocks.completeDailyTaskThroughCoreApi).not.toHaveBeenCalled()
    expect(latestEvent()).toMatchObject({
      trace_id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      tenant_id: null,
      actor_id: null,
      action: 'daily_task.complete',
      outcome: 'unauthorized',
    })
  })

  it('rejects invalid context and hostile or duplicated browser fields', async () => {
    const hostile = form('Safe')
    hostile.set('tenantId', TENANT_ID)
    hostile.set('actorId', USER_ID)
    hostile.set('role', 'owner')
    hostile.set('assigneeId', USER_ID)
    hostile.set('status', 'done')

    await expect(completeTask(CONTEXT, hostile)).resolves.toEqual({
      error: 'Invalid daily task completion request.',
    })

    const duplicated = form('First')
    duplicated.append('notes', 'Second')
    await expect(completeTask(CONTEXT, duplicated)).resolves.toEqual({
      error: 'Invalid daily task completion request.',
    })

    await expect(
      completeTask({ ...CONTEXT, taskId: 'not-a-uuid' }, form())
    ).resolves.toEqual({ error: 'Invalid daily task completion request.' })
    expect(mocks.requireUserProfile).not.toHaveBeenCalled()
    expect(mocks.completeDailyTaskThroughCoreApi).not.toHaveBeenCalled()
  })

  it('normalizes optional notes with the shared schema and never truncates', async () => {
    mocks.completeDailyTaskThroughCoreApi.mockResolvedValue(
      coreResult({ completionNotes: 'Site secured' })
    )

    await expect(completeTask(CONTEXT, form('  Site secured  '))).resolves.toEqual({
      ok: true,
      message: 'Task is complete.',
    })
    expect(mocks.completeDailyTaskThroughCoreApi).toHaveBeenCalledWith(
      TASK_ID,
      { notes: 'Site secured' },
      expect.stringMatching(/^[a-f0-9]{64}$/)
    )

    mocks.completeDailyTaskThroughCoreApi.mockClear()
    await completeTask(CONTEXT, form('   '))
    expect(mocks.completeDailyTaskThroughCoreApi).toHaveBeenCalledWith(
      TASK_ID,
      {},
      expect.any(String)
    )

    await expect(completeTask(CONTEXT, form('x'.repeat(2_001)))).resolves.toEqual({
      error: 'Invalid daily task completion request.',
    })
  })

  it('requires toolbox notes before making a request', async () => {
    await expect(
      completeTask({ ...CONTEXT, requiresNotes: true }, form('   '))
    ).resolves.toEqual({ error: 'Toolbox meeting log requires notes.' })
    expect(mocks.completeDailyTaskThroughCoreApi).not.toHaveBeenCalled()
  })

  it('derives a stable SHA-256 key from task identity and the full normalized command', async () => {
    mocks.completeDailyTaskThroughCoreApi.mockResolvedValue(
      coreResult({ completionNotes: 'Same note' })
    )
    await completeTask(CONTEXT, form(' Same note '))
    await completeTask(CONTEXT, form('Same note'))
    const firstKey = mocks.completeDailyTaskThroughCoreApi.mock.calls[0]?.[2]
    const replayKey = mocks.completeDailyTaskThroughCoreApi.mock.calls[1]?.[2]
    expect(firstKey).toBe(replayKey)
    expect(firstKey).toBe(
      '7c304298d6e67dbf16ef39c122df9f9513e3ba8afc908cdde83d26da00bebfb3'
    )

    mocks.completeDailyTaskThroughCoreApi.mockResolvedValue(
      coreResult({ completionNotes: 'Different note' })
    )
    await completeTask(CONTEXT, form('Different note'))
    expect(mocks.completeDailyTaskThroughCoreApi.mock.calls[2]?.[2]).not.toBe(
      firstKey
    )

    const otherTask = '55555555-5555-4555-8555-555555555555'
    mocks.completeDailyTaskThroughCoreApi.mockResolvedValue(
      coreResult({ taskId: otherTask, completionNotes: 'Same note' })
    )
    await completeTask({ ...CONTEXT, taskId: otherTask }, form('Same note'))
    expect(mocks.completeDailyTaskThroughCoreApi.mock.calls[3]?.[2]).not.toBe(
      firstKey
    )
  })

  it.each([
    ['selector denial', () => mocks.dailyTaskCompletionWritesUseCoreApi.mockReturnValue(false)],
    ['selector throw', () => mocks.dailyTaskCompletionWritesUseCoreApi.mockImplementation(() => { throw new Error('selector') })],
    ['Core returned error', () => mocks.completeDailyTaskThroughCoreApi.mockResolvedValue({ ok: false, error: 'Daily task is no longer pending.' })],
    ['Core throw', () => mocks.completeDailyTaskThroughCoreApi.mockRejectedValue(new Error('timeout'))],
  ] as const)('fails closed on %s without refresh', async (_name, arrange) => {
    arrange()
    const result = await completeTask(CONTEXT, form())

    expect(result.error).toBeTruthy()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['taskId', '55555555-5555-4555-8555-555555555555'],
    ['tenantId', '55555555-5555-4555-8555-555555555555'],
    ['projectId', '55555555-5555-4555-8555-555555555555'],
    ['assigneeId', '55555555-5555-4555-8555-555555555555'],
    ['status', 'pending'],
    ['completedAt', 'not-a-date'],
    ['completionNotes', 'x'.repeat(2_001)],
  ])('rejects a mismatched Core %s without refresh', async (field, value) => {
    mocks.completeDailyTaskThroughCoreApi.mockResolvedValue(
      coreResult({ [field]: value })
    )

    await expect(completeTask(CONTEXT, form())).resolves.toEqual({
      error: 'ERP Core API returned an invalid daily task completion result.',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('accepts an authoritative already-done result without claiming a new mutation', async () => {
    const originalActor = '55555555-5555-4555-8555-555555555555'
    mocks.completeDailyTaskThroughCoreApi.mockResolvedValue(
      coreResult({
        completionNotes: 'Persisted by the original completion',
        completedBy: originalActor,
      })
    )

    await expect(completeTask(CONTEXT, form('Stale browser note'))).resolves.toEqual({
      ok: true,
      message: 'Task is complete.',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/tasks')
  })

  it('calls Core exactly once, refreshes only after strict success, and logs redacted outcome', async () => {
    mocks.completeDailyTaskThroughCoreApi.mockResolvedValue(
      coreResult({ completionNotes: 'Sensitive field note' })
    )

    const result = await completeTask(CONTEXT, form('Sensitive field note'))

    expect(result).toEqual({ ok: true, message: 'Task is complete.' })
    expect(mocks.completeDailyTaskThroughCoreApi).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/tasks')
    expect(latestEvent()).toMatchObject({
      trace_id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      tenant_id: TENANT_ID,
      actor_id: USER_ID,
      action: 'daily_task.complete',
      outcome: 'success',
    })
    expect(JSON.stringify(latestEvent())).not.toContain('Sensitive field note')
    expect(JSON.stringify(latestEvent())).not.toContain(
      mocks.completeDailyTaskThroughCoreApi.mock.calls[0]?.[2]
    )
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})

const ASSIGNEE_ID = '55555555-5555-4555-8555-555555555555'
// 2026-11-04 10:00 Manila; due dates in the fixtures are relative to this instant.
const CREATE_NOW = new Date('2026-11-04T02:00:00.000Z')
const RANGE_ERROR = 'Choose a due date within the past 30 days or the next year.'
const UPWARD_ERROR = 'Only an owner or admin can assign tasks to an owner or admin.'

function taskForm(overrides: Record<string, string> = {}): FormData {
  const result = new FormData()
  const fields = {
    title: '  Confirm ceiling board delivery  ',
    project_id: PROJECT_ID,
    assignee_id: ASSIGNEE_ID,
    due_at: '2026-11-05T17:00',
    description: '',
    ...overrides,
  }
  for (const [key, value] of Object.entries(fields)) result.set(key, value)
  return result
}

function renderedWhere(index: number) {
  return new PgDialect().sqlToQuery(mocks.selectWheres[index] as SQL)
}

describe('createTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(CREATE_NOW)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.selectResults.length = 0
    mocks.selectWheres.length = 0
    mocks.insertedValues.length = 0
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'admin',
      email: 'admin@example.test',
      fullName: 'Admin User',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a manual task in the caller tenant at Manila due time and audits it', async () => {
    mocks.selectResults.push(
      [{ id: PROJECT_ID, status: 'active' }],
      [{ id: ASSIGNEE_ID, role: 'safety', status: 'active' }]
    )

    const result = await createTask(taskForm())

    expect(result).toEqual({ ok: true, message: 'Task created.' })
    expect(mocks.insertedValues).toEqual([
      expect.objectContaining({
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        assignee_id: ASSIGNEE_ID,
        title: 'Confirm ceiling board delivery',
        description: null,
        role: null,
        status: 'pending',
        due_date: new Date('2026-11-05T09:00:00.000Z'),
      }),
    ])
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: 'daily_task', entityId: 'new-task-id', action: 'create' })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/tasks')
  })

  it('scopes the project and assignee lookups to the session tenant, never to form input', async () => {
    mocks.selectResults.push(
      [{ id: PROJECT_ID, status: 'active' }],
      [{ id: ASSIGNEE_ID, role: 'safety', status: 'active' }]
    )

    await createTask(taskForm())

    const project = renderedWhere(0)
    expect(project.sql).toBe('("projects"."id" = $1 and "projects"."tenant_id" = $2)')
    expect(project.params).toEqual([PROJECT_ID, TENANT_ID])
    const assignee = renderedWhere(1)
    expect(assignee.sql).toBe('("users"."id" = $1 and "users"."tenant_id" = $2)')
    expect(assignee.params).toEqual([ASSIGNEE_ID, TENANT_ID])
  })

  it.each(ERP_ROLES)('allows creation only for the daily-task capability (%s)', async (role: ErpRole) => {
    mocks.requireUserProfile.mockResolvedValue({ user: { id: USER_ID }, tenantId: TENANT_ID, role })
    mocks.selectResults.push(
      [{ id: PROJECT_ID, status: 'active' }],
      [{ id: ASSIGNEE_ID, role: 'pm', status: 'active' }]
    )

    const result = await createTask(taskForm())
    const allowed = ['owner', 'admin', 'sd_pm_pe', 'pm', 'safety'].includes(role)

    expect(result).toEqual(allowed ? { ok: true, message: 'Task created.' } : { error: 'Forbidden' })
    expect(mocks.insertedValues).toHaveLength(allowed ? 1 : 0)
  })

  it.each([
    ['missing title', { title: '   ' }, 'Enter a task title.'],
    ['bad project id', { project_id: 'nope' }, 'Choose a project.'],
    ['bad due value', { due_at: 'tomorrow' }, 'Enter a due date and time.'],
    ['unknown field', { tenant_id: TENANT_ID }, 'Invalid task request.'],
    ['inherited key name', { toString: 'x' }, 'Invalid task request.'],
  ])('rejects %s before any write', async (_label, overrides, message) => {
    const result = await createTask(taskForm(overrides as Record<string, string>))

    expect(result).toEqual({ error: message })
    expect(mocks.requireUserProfile).not.toHaveBeenCalled()
    expect(mocks.insertedValues).toHaveLength(0)
  })

  it.each(['title', 'project_id', 'assignee_id', 'due_at'])(
    'rejects a duplicated %s field before any lookup',
    async (field) => {
      const data = taskForm()
      data.append(field, field === 'title' ? 'Second title' : (data.get(field) as string))

      expect(await createTask(data)).toEqual({ error: 'Invalid task request.' })
      expect(mocks.requireUserProfile).not.toHaveBeenCalled()
      expect(mocks.selectWheres).toHaveLength(0)
    }
  )

  it.each([
    ['February 30', '2026-02-30T10:00'],
    ['April 31', '2026-04-31T23:59'],
    ['hour 24', '2026-11-05T24:00'],
    ['minute 60', '2026-11-05T12:60'],
    ['year 0000', '0000-01-01T00:00'],
  ])('rejects an impossible due date (%s) instead of rolling it over', async (_label, dueAt) => {
    expect(await createTask(taskForm({ due_at: dueAt }))).toEqual({
      error: 'Enter a due date and time.',
    })
    expect(mocks.requireUserProfile).not.toHaveBeenCalled()
    expect(mocks.insertedValues).toHaveLength(0)
  })

  it.each([
    ['more than 30 days ago', '2026-10-04T09:00'],
    ['more than a year ahead', '2027-11-05T09:00'],
    ['in 1900', '1900-01-01T00:00'],
    ['in 9999', '9999-12-31T23:59'],
  ])('rejects a due date %s', async (_label, dueAt) => {
    expect(await createTask(taskForm({ due_at: dueAt }))).toEqual({ error: RANGE_ERROR })
    expect(mocks.requireUserProfile).not.toHaveBeenCalled()
    expect(mocks.insertedValues).toHaveLength(0)
  })

  it('accepts a due date earlier today, inside the lookback window', async () => {
    mocks.selectResults.push(
      [{ id: PROJECT_ID, status: 'active' }],
      [{ id: ASSIGNEE_ID, role: 'safety', status: 'active' }]
    )

    expect(await createTask(taskForm({ due_at: '2026-11-04T08:00' }))).toEqual({
      ok: true,
      message: 'Task created.',
    })
    expect(mocks.insertedValues).toEqual([
      expect.objectContaining({ due_date: new Date('2026-11-04T00:00:00.000Z') }),
    ])
  })

  it('rejects projects outside the tenant or already closed', async () => {
    mocks.selectResults.push([])
    expect(await createTask(taskForm())).toEqual({ error: 'Project not found.' })

    mocks.selectResults.push([{ id: PROJECT_ID, status: 'completed' }])
    expect(await createTask(taskForm())).toEqual({
      error: 'Tasks cannot be added to a completed or cancelled project.',
    })
    expect(mocks.insertedValues).toHaveLength(0)
  })

  it.each([
    ['outside the tenant', []],
    ['suspended', [{ id: ASSIGNEE_ID, role: 'safety', status: 'suspended' }]],
    ['unable to complete tasks', [{ id: ASSIGNEE_ID, role: 'sales', status: 'active' }]],
  ])('rejects an assignee %s', async (_label, assigneeRows) => {
    mocks.selectResults.push([{ id: PROJECT_ID, status: 'active' }], assigneeRows)

    expect(await createTask(taskForm())).toEqual({
      error: 'Choose an active teammate who can complete tasks.',
    })
    expect(mocks.insertedValues).toHaveLength(0)
  })

  it.each([
    ['safety', 'owner'],
    ['safety', 'admin'],
    ['pm', 'owner'],
    ['sd_pm_pe', 'admin'],
  ] as const)('refuses a %s assigning a task upward to an %s', async (actorRole, assigneeRole) => {
    mocks.requireUserProfile.mockResolvedValue({ user: { id: USER_ID }, tenantId: TENANT_ID, role: actorRole })
    mocks.selectResults.push(
      [{ id: PROJECT_ID, status: 'active' }],
      [{ id: ASSIGNEE_ID, role: assigneeRole, status: 'active' }]
    )

    expect(await createTask(taskForm())).toEqual({ error: UPWARD_ERROR })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.insertedValues).toHaveLength(0)
  })

  it.each([
    ['admin', 'owner'],
    ['owner', 'admin'],
    ['safety', 'pm'],
  ] as const)('lets a %s assign a task to an %s', async (actorRole, assigneeRole) => {
    mocks.requireUserProfile.mockResolvedValue({ user: { id: USER_ID }, tenantId: TENANT_ID, role: actorRole })
    mocks.selectResults.push(
      [{ id: PROJECT_ID, status: 'active' }],
      [{ id: ASSIGNEE_ID, role: assigneeRole, status: 'active' }]
    )

    expect(await createTask(taskForm())).toEqual({ ok: true, message: 'Task created.' })
    expect(mocks.insertedValues).toHaveLength(1)
  })

  it('returns a safe error and a redacted trace when the write fails', async () => {
    mocks.selectResults.push(
      [{ id: PROJECT_ID, status: 'active' }],
      [{ id: ASSIGNEE_ID, role: 'safety', status: 'active' }]
    )
    mocks.transaction.mockRejectedValueOnce(new Error('insert into daily_tasks ... Confirm ceiling board delivery'))

    const result = await createTask(taskForm())

    expect(result).toEqual({ error: 'The task could not be created. Please try again.' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    const warn = vi.mocked(console.warn).mock.calls.at(-1)
    expect(warn?.[0]).toBe('[daily-task-create]')
    expect(warn?.[1]).toEqual({
      trace_id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      tenant_id: TENANT_ID,
      actor_id: USER_ID,
      action: 'daily_task.create',
      outcome: 'exception',
    })
    expect(JSON.stringify(warn)).not.toContain('Confirm ceiling board delivery')
  })
})

describe('triggerDailyGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'owner',
    })
  })

  it('generates synchronously for the caller tenant and reports what was created', async () => {
    mocks.generateTasksForDate.mockResolvedValue({ created: 21, skipped: 2, projectsConsidered: 3 })

    const result = await triggerDailyGeneration()

    expect(mocks.generateTasksForDate).toHaveBeenCalledWith(TENANT_ID, expect.any(Date))
    expect(result).toEqual({
      ok: true,
      message: 'Generated 21 tasks across 3 active projects. 2 already existed.',
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'cadence', diff: expect.objectContaining({ created: 21 }) })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/tasks')
  })

  it.each([
    [{ created: 0, skipped: 21, projectsConsidered: 3 }, 'Today’s cadence is already generated: 21 tasks across 3 active projects. Nothing new was added.'],
    [{ created: 0, skipped: 0, projectsConsidered: 0 }, 'There are no active projects, so no cadence tasks were generated.'],
    [{ created: 0, skipped: 0, projectsConsidered: 2 }, 'No active teammates hold a cadence role (SD / PM / PE, Safety, Commercial, Procurement), so no tasks were generated.'],
  ])('explains a run that adds nothing (%o)', async (summary, message) => {
    mocks.generateTasksForDate.mockResolvedValue(summary)

    expect(await triggerDailyGeneration()).toEqual({ ok: true, message })
  })

  it('still reports committed tasks when only the run summary audit fails', async () => {
    mocks.generateTasksForDate.mockResolvedValue({ created: 4, skipped: 0, projectsConsidered: 1 })
    mocks.writeAuditLog.mockRejectedValueOnce(new Error('audit lock timeout'))

    expect(await triggerDailyGeneration()).toEqual({
      ok: true,
      message: 'Generated 4 tasks across 1 active project.',
    })
    expect(console.warn).toHaveBeenCalledWith('[triggerDailyGeneration] run summary audit failed', {
      tenant_id: TENANT_ID,
      actor_id: USER_ID,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/tasks')
  })

  it('denies non-admin roles and surfaces engine failures without auditing', async () => {
    mocks.requireUserProfile.mockResolvedValueOnce({ user: { id: USER_ID }, tenantId: TENANT_ID, role: 'pm' })
    expect(await triggerDailyGeneration()).toEqual({ error: 'Forbidden' })

    mocks.generateTasksForDate.mockRejectedValue(new Error('db down'))
    expect(await triggerDailyGeneration()).toEqual({ error: 'Task generation failed. Please try again.' })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})
