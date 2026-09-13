import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCostEntryThroughCoreApi, deleteCostEntryThroughCoreApi } from './erp-core-client'

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
const CREATE_COMMAND = { costCodeId: ENTRY_ID, costCategory: 'material' as const, description: 'Concrete', amountCents: 125, quantity: 1, unit: null, incurredAt: null, referenceNumber: null, notes: null }

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

  it('does not mistake an unclassified 503 for proof of no committed write', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 503 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      deleteCostEntryThroughCoreApi(PROJECT_ID, ENTRY_ID, 'Manual correction', 'key-2')
    ).resolves.toEqual({
      ok: false,
      error: expect.any(String),
      status: 503,
      outcomeUnknown: true,
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
      outcomeUnknown: true,
    })
  })

  it('fails closed when Core is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(
      deleteCostEntryThroughCoreApi(PROJECT_ID, ENTRY_ID, 'Manual correction', 'key-4')
    ).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('unconfirmed'),
      outcomeUnknown: true,
    })
  })

  it.each(['create', 'void'] as const)('keeps %s server errors private and marks the result unconfirmed', async (operation) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'secret database host' }), { status: 500 })))
    const result = operation === 'create'
      ? await createCostEntryThroughCoreApi(PROJECT_ID, { costCodeId: ENTRY_ID, costCategory: 'material', description: 'Concrete', amountCents: 125, quantity: 1, unit: null, incurredAt: null, referenceNumber: null, notes: null }, 'key-5')
      : await deleteCostEntryThroughCoreApi(PROJECT_ID, ENTRY_ID, 'Correction', 'key-5')
    expect(result).toMatchObject({ ok: false, status: 500, outcomeUnknown: true })
    expect(JSON.stringify(result)).not.toContain('secret database host')
  })

  it('marks a lost creation response as unconfirmed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret timeout')))
    const result = await createCostEntryThroughCoreApi(PROJECT_ID, { costCodeId: ENTRY_ID, costCategory: 'material', description: 'Concrete', amountCents: 125, quantity: 1, unit: null, incurredAt: null, referenceNumber: null, notes: null }, 'key-6')
    expect(result).toMatchObject({ ok: false, outcomeUnknown: true, error: expect.stringContaining('unconfirmed') })
    expect(JSON.stringify(result)).not.toContain('secret timeout')
  })

  it('validates successful creation and preserves exact command and request key', async () => {
    const created = { ...CREATE_COMMAND, id: ENTRY_ID, projectId: PROJECT_ID, tenantId: TENANT_ID, costSource: 'manual', incurredAt: '2026-08-07T00:00:00.000Z', createdAt: '2026-08-07T00:00:00.000Z' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await createCostEntryThroughCoreApi(PROJECT_ID, CREATE_COMMAND, 'exact-create-key')).toEqual({ ok: true, data: created })
    expect(fetchMock).toHaveBeenCalledWith(`https://erp-api.example.test/v1/projects/${PROJECT_ID}/cost-entries`, expect.objectContaining({ method: 'POST', body: JSON.stringify(CREATE_COMMAND), headers: expect.objectContaining({ 'Idempotency-Key': 'exact-create-key' }) }))
  })

  it('does not treat malformed successful creation as proof of rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: ENTRY_ID }), { status: 201 })))
    expect(await createCostEntryThroughCoreApi(PROJECT_ID, CREATE_COMMAND, 'invalid-create-result')).toMatchObject({ ok: false, outcomeUnknown: true })
  })

  it('maps a definite access rejection without reflecting arbitrary server text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'secret access context' }), { status: 403 })))
    const result = await createCostEntryThroughCoreApi(PROJECT_ID, CREATE_COMMAND, 'rejected-create')
    expect(result).toEqual({ ok: false, status: 403, error: 'You do not have permission to change this cost entry.' })
  })
})
