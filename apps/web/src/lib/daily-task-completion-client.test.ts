import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getSession: mocks.getSession },
  })),
}))

import {
  completeDailyTaskThroughCoreApi,
  dailyTaskCompletionWritesUseCoreApi,
} from './erp-core-client'

const TASK_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'
const RESULT = {
  ok: true as const,
  taskId: TASK_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  assigneeId: USER_ID,
  status: 'done' as const,
  completionNotes: 'PPE reviewed',
  completedAt: '2026-09-03T04:00:00.000Z',
  completedBy: USER_ID,
}

describe('daily-task completion Core client', () => {
  beforeEach(() => {
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test/')
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'secret-token' } },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('selects only an explicitly enabled valid tenant', () => {
    vi.stubEnv('ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API_TENANT_IDS', TENANT_ID)
    expect(dailyTaskCompletionWritesUseCoreApi(TENANT_ID)).toBe(true)
    expect(
      dailyTaskCompletionWritesUseCoreApi(
        '55555555-5555-4555-8555-555555555555'
      )
    ).toBe(false)
    vi.stubEnv('ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API_TENANT_IDS', '*')
    expect(dailyTaskCompletionWritesUseCoreApi(TENANT_ID)).toBe(true)
    vi.stubEnv('ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API', 'TRUE')
    expect(dailyTaskCompletionWritesUseCoreApi(TENANT_ID)).toBe(false)
  })

  it('posts one authenticated strict command with the caller idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      completeDailyTaskThroughCoreApi(
        TASK_ID,
        { notes: 'PPE reviewed' },
        'stable-key'
      )
    ).resolves.toEqual({ ok: true, data: RESULT, status: 200 })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/daily-tasks/${TASK_ID}/completion`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ notes: 'PPE reviewed' }),
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-token',
          'Idempotency-Key': 'stable-key',
          'content-type': 'application/json',
        }),
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('returns Core errors and fails closed on transport or malformed results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Toolbox meeting log requires notes' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        })
      )
    )
    await expect(
      completeDailyTaskThroughCoreApi(TASK_ID, {}, 'stable-key')
    ).resolves.toEqual({
      ok: false,
      error: 'Toolbox meeting log requires notes',
      status: 409,
    })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    await expect(
      completeDailyTaskThroughCoreApi(TASK_ID, {}, 'stable-key')
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API is unavailable. No daily task was completed.',
      status: 503,
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...RESULT, completedAt: 'not-a-date' }), {
          status: 200,
        })
      )
    )
    await expect(
      completeDailyTaskThroughCoreApi(TASK_ID, {}, 'stable-key')
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API returned an invalid daily task completion result.',
      status: 200,
    })
  })
})
