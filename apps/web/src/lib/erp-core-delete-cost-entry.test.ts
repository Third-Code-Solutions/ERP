import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCostEntryThroughCoreApi } from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '55555555-5555-4555-8555-555555555555'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'never-log-or-return-this-token'
const RESULT = {
  costEntryId: ENTRY_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  costSource: 'manual' as const,
  status: 'voided' as const,
  voidedAt: '2026-08-07T00:00:00.000Z',
  restorable: true as const,
}

describe('deleteCostEntryThroughCoreApi', () => {
  beforeEach(() => {
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: TOKEN } },
        }),
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends an authenticated idempotent DELETE and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      deleteCostEntryThroughCoreApi(
        PROJECT_ID,
        ENTRY_ID,
        'Duplicate manual entry',
        'cost-delete-1'
      )
    ).resolves.toEqual({ ok: true, data: RESULT, status: 200 })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/cost-entries/${ENTRY_ID}`,
      expect.objectContaining({
        method: 'DELETE',
        cache: 'no-store',
        body: JSON.stringify({ reason: 'Duplicate manual entry' }),
        headers: expect.objectContaining({
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'cost-delete-1',
          'x-request-id': expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        }),
      })
    )
  })

  it('maps a closed Core tenant gate without pretending a write happened', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 503 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      deleteCostEntryThroughCoreApi(PROJECT_ID, ENTRY_ID, 'Manual correction', 'key-2')
    ).resolves.toEqual({
      ok: false,
      error: 'Cost entry deletion is not enabled for this tenant.',
      status: 503,
    })
  })

  it('rejects an invalid successful Core payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ costEntryId: ENTRY_ID }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      deleteCostEntryThroughCoreApi(PROJECT_ID, ENTRY_ID, 'Manual correction', 'key-3')
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API returned an invalid cost entry deletion result.',
    })
  })

  it('fails closed when Core is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(
      deleteCostEntryThroughCoreApi(PROJECT_ID, ENTRY_ID, 'Manual correction', 'key-4')
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API is unavailable. No cost entry was changed.',
    })
  })
})
