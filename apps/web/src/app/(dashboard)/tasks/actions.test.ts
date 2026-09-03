import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ERP_ROLES, type ErpRole } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  revalidatePath: vi.fn(),
  dailyTaskCompletionWritesUseCoreApi: vi.fn(),
  completeDailyTaskThroughCoreApi: vi.fn(),
  writeAuditLog: vi.fn(),
  info: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

vi.mock('@third-code-erp/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@third-code-erp/auth')>()
  return { ...actual, requireUserProfile: mocks.requireUserProfile }
})

vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/inngest', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@/lib/erp-core-client', () => ({
  dailyTaskCompletionWritesUseCoreApi:
    mocks.dailyTaskCompletionWritesUseCoreApi,
  completeDailyTaskThroughCoreApi: mocks.completeDailyTaskThroughCoreApi,
}))

import { completeTask, type CompleteTaskContext } from './actions'

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
