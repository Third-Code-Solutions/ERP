import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getTodayThroughCoreApi,
  todayReadsUseCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const RESULT = {
  summary: { dueToday: 1, overdue: 0, upcoming: 2 },
  tasks: [],
  projects: [],
}

describe('Today Core client', () => {
  beforeEach(() => {
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'test-token' } },
        }),
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps Today on the direct path unless an exact tenant canary matches', () => {
    expect(todayReadsUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_TODAY_READS_VIA_API', 'true')
    vi.stubEnv('ERP_TODAY_READS_VIA_API_TENANT_IDS', TENANT_ID)
    expect(todayReadsUseCoreApi(TENANT_ID)).toBe(true)
    vi.stubEnv('ERP_TODAY_READS_VIA_API', 'TRUE')
    expect(todayReadsUseCoreApi(TENANT_ID)).toBe(false)
  })

  it('calls the authenticated Today read route and validates its response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(RESULT), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getTodayThroughCoreApi(true)).resolves.toMatchObject({
      ok: true,
      data: RESULT,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/today?includeProjects=true',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer test-token',
        }),
      })
    )
  })

  it('fails closed on an invalid Core response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ summary: {} }), { status: 200 })
      )
    )
    await expect(getTodayThroughCoreApi()).resolves.toMatchObject({
      ok: false,
      error: 'ERP Core API returned an invalid Today result.',
    })
  })
})
