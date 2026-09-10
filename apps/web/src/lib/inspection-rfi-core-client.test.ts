import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getInspectionRfisThroughCoreApi,
  transitionInspectionRfiThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const RFI_ID = '44444444-4444-4444-8444-444444444444'
const INSPECTION_ID = '55555555-5555-4555-8555-555555555555'
const ACTOR_ID = '66666666-6666-4666-8666-666666666666'

const RFI = {
  id: RFI_ID,
  inspectionId: INSPECTION_ID,
  inspectionStatus: 'submitted' as const,
  description: 'Confirm ceiling coordination detail',
  priority: 'major' as const,
  createdAt: '2026-09-10T00:00:00.000Z',
  resolvedAt: null,
  resolvedBy: null,
}

const LIST = {
  opportunityId: OPPORTUNITY_ID,
  rows: [RFI],
  total: 1,
  page: 1,
  limit: 25,
  totalPages: 1,
}

describe('inspection RFI Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('reads a filtered, paginated register through Core', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LIST), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getInspectionRfisThroughCoreApi(OPPORTUNITY_ID, {
        status: 'open',
        priority: 'major',
        page: 2,
        limit: 10,
      })
    ).resolves.toEqual({ ok: true, data: LIST })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/crm/opportunities/${OPPORTUNITY_ID}/inspection-rfis?status=open&priority=major&page=2&limit=10`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    )
  })

  it('rejects invalid filters before calling Core', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getInspectionRfisThroughCoreApi(OPPORTUNITY_ID, {
        status: 'closed',
        unexpected: true,
      })
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Invalid inspection RFI filters.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts an audited resolve command with the expected state', async () => {
    const result = { opportunityId: OPPORTUNITY_ID, changed: true, rfi: {
      ...RFI,
      resolvedAt: '2026-09-10T02:00:00.000Z',
      resolvedBy: ACTOR_ID,
    } }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transitionInspectionRfiThroughCoreApi(OPPORTUNITY_ID, RFI_ID, 'resolve', {
        expectedResolvedAt: null,
        reason: 'Design confirmed the coordination detail.',
      })
    ).resolves.toEqual({ ok: true, data: result })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/crm/opportunities/${OPPORTUNITY_ID}/inspection-rfis/${RFI_ID}/resolve`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedResolvedAt: null,
          reason: 'Design confirmed the coordination detail.',
        }),
      })
    )
  })

  it('preserves Core conflicts for stale transitions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'RFI changed; refresh' }), {
          status: 409,
        })
      )
    )

    await expect(
      transitionInspectionRfiThroughCoreApi(OPPORTUNITY_ID, RFI_ID, 'reopen', {
        expectedResolvedAt: '2026-09-10T01:00:00.000Z',
        reason: 'Reopen after new evidence.',
      })
    ).resolves.toEqual({ ok: false, status: 409, error: 'RFI changed; refresh' })
  })

  it('does not claim a transport timeout is a definite failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

    await expect(
      transitionInspectionRfiThroughCoreApi(OPPORTUNITY_ID, RFI_ID, 'resolve', {
        expectedResolvedAt: null,
        reason: 'Resolved after confirmation.',
      })
    ).resolves.toEqual({
      ok: false,
      status: 503,
      error:
        'ERP Core API is unavailable. Inspection RFI transition outcome is unconfirmed; refresh before retrying.',
    })
  })
})
