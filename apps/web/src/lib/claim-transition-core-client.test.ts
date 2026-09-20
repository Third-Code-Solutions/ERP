import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCoreApiAccess: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({ getCoreApiAccess: mocks.getCoreApiAccess }))

import { transitionClaimThroughCoreApi } from './claim-transition-core-client'

const CLAIM_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('claim transition Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.getCoreApiAccess.mockResolvedValue({ ok: true, baseUrl: 'https://core.example.test', accessToken: 'token' })
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        claimId: CLAIM_ID,
        changed: true,
        receipt: {
          schemaVersion: 1,
          operation: 'transition',
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
          claimId: CLAIM_ID,
          projectId: PROJECT_ID,
          clientRequestId: REQUEST_ID,
          payloadHash: 'a'.repeat(64),
          action: 'submit',
          fromStatus: 'draft',
          toStatus: 'submitted',
          changedAt: '2026-09-20T00:00:00.000Z',
        },
      }),
    })
  })

  it('rejects malformed commands before reaching Core', async () => {
    await expect(transitionClaimThroughCoreApi(CLAIM_ID, { action: 'submit', clientRequestId: 'bad' })).resolves.toMatchObject({ ok: false, status: 400, outcomeUnknown: false })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('sends the stable request identity and preserves confirmed responses', async () => {
    const result = await transitionClaimThroughCoreApi(CLAIM_ID, { action: 'submit', clientRequestId: REQUEST_ID })
    expect(result).toMatchObject({ ok: true, data: { claimId: CLAIM_ID, changed: true } })
    expect(mocks.fetch).toHaveBeenCalledWith(
      `https://core.example.test/v1/claims/${CLAIM_ID}/transition`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': REQUEST_ID }),
      }),
    )
  })

  it('marks transport failures unknown for unchanged-command retry', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('timeout'))
    await expect(transitionClaimThroughCoreApi(CLAIM_ID, { action: 'submit', clientRequestId: REQUEST_ID })).resolves.toMatchObject({ ok: false, status: 503, outcomeUnknown: true })
  })
})
