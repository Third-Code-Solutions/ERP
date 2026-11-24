import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCoreApiAccess: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({ getCoreApiAccess: mocks.getCoreApiAccess }))

import { createClaimDraftThroughCoreApi } from './claim-draft-core-client'

const command = {
  clientRequestId: '66666666-6666-4666-8666-666666666666',
  projectId: '33333333-3333-4333-8333-333333333333',
  milestonePct: 40,
  amountCents: 150_000,
  description: 'Mobilization',
}

function refusal(status: number, body: unknown) {
  return { ok: false, status, json: async () => body }
}

describe('claim draft Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.getCoreApiAccess.mockResolvedValue({ ok: true, baseUrl: 'https://core.example.test', accessToken: 'token' })
  })

  it('carries the contract-sum message of a cap refusal', async () => {
    const message = 'No further claim fits the contract sum. Reject or cancel a claim, or sign a variation order.'
    mocks.fetch.mockResolvedValue(refusal(409, { code: 'claim_cap_exceeded', message }))

    await expect(createClaimDraftThroughCoreApi(command)).resolves.toEqual({
      ok: false,
      status: 409,
      outcomeUnknown: false,
      code: 'claim_cap_exceeded',
      error: message,
    })
  })

  it.each([
    ['a 409 without the cap code', refusal(409, { message: 'Client request id was already used by another claim draft command' })],
    ['a 409 with an unreadable body', { ok: false, status: 409, json: async () => { throw new Error('not json') } }],
    ['another refusal carrying the cap code', refusal(403, { code: 'claim_cap_exceeded', message: 'private detail' })],
  ])('keeps the generic message for %s', async (_label, response) => {
    mocks.fetch.mockResolvedValue(response)

    const result = await createClaimDraftThroughCoreApi(command)

    expect(result).toMatchObject({ ok: false, error: 'The claim service did not confirm this draft.' })
    expect(result).not.toHaveProperty('code')
  })
})
