import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  projectWritesUseCoreApi,
  updateProjectThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RESULT = {
  id: PROJECT_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  name: 'Updated Project',
  client: 'Updated Client',
  status: 'active' as const,
  projectType: 'fit_out' as const,
  totalSqm: 125,
  location: 'Makati',
  notes: 'Controlled update',
  updatedAt: '2026-07-28T00:00:00.000Z',
}

describe('ERP Core client', () => {
  beforeEach(() => {
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'never-log-or-return-this-token',
            },
          },
        }),
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('keeps legacy writes active unless the flag is exactly true', () => {
    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', '')
    expect(projectWritesUseCoreApi()).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', 'false')
    expect(projectWritesUseCoreApi()).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', 'TRUE')
    expect(projectWritesUseCoreApi()).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', 'true')
    expect(projectWritesUseCoreApi()).toBe(true)
  })

  it('forwards a UUID correlation header to the Nest command', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateProjectThroughCoreApi(PROJECT_ID, {
        name: RESULT.name,
        client: RESULT.client,
        status: RESULT.status,
        projectType: RESULT.projectType,
        totalSqm: RESULT.totalSqm,
        location: RESULT.location,
        notes: RESULT.notes,
        expectedUpdatedAt: '2026-07-27T00:00:00.000Z',
      })
    ).resolves.toEqual({ ok: true, data: RESULT })

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(request.headers).toMatchObject({
      authorization: 'Bearer never-log-or-return-this-token',
      'content-type': 'application/json',
      'x-request-id': expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ),
    })
  })
})
