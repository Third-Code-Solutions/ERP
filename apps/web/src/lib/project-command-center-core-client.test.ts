import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))

import {
  getProjectCommandCenterThroughCoreApi,
  projectCommandCenterReadsUseCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

const RESULT = {
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  pendingTasks: 2,
  overdueTasks: 1,
  documents: 3,
  pendingDecisions: 1,
  openPunchlist: 2,
  activeDeliveries: 1,
  progressPercent: 42,
  progressWeekEnding: '2026-08-10T00:00:00.000Z',
}

describe('project command center Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'test-access-token' } },
        }),
      },
    })
  })

  it('requires an exact tenant selector and rejects wildcard canaries', () => {
    expect(projectCommandCenterReadsUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_PROJECT_COMMAND_CENTER_READS_VIA_API', 'true')
    vi.stubEnv(
      'ERP_PROJECT_COMMAND_CENTER_READS_VIA_API_TENANT_IDS',
      TENANT_ID
    )
    expect(projectCommandCenterReadsUseCoreApi(TENANT_ID)).toBe(true)
    vi.stubEnv('ERP_PROJECT_COMMAND_CENTER_READS_VIA_API_TENANT_IDS', '*')
    expect(projectCommandCenterReadsUseCoreApi(TENANT_ID)).toBe(false)
  })

  it('reads and validates project-scoped operational signals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getProjectCommandCenterThroughCoreApi(PROJECT_ID)
    ).resolves.toEqual({ ok: true, data: RESULT, status: 200 })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/command-center`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer test-access-token',
        }),
      })
    )
  })

  it('fails closed for malformed signal payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ tenantId: TENANT_ID }), { status: 200 })
      )
    )

    await expect(
      getProjectCommandCenterThroughCoreApi(PROJECT_ID)
    ).resolves.toMatchObject({
      ok: false,
      status: 200,
      error: 'ERP Core API returned an invalid project command center result.',
    })
  })
})
