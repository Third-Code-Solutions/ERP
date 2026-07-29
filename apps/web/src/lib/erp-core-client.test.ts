import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  logRfqQuoteThroughCoreApi,
  projectWritesUseCoreApi,
  rfqQuoteWritesUseCoreApi,
  rfqTerminalWritesUseCoreApi,
  transitionRfqThroughCoreApi,
  updateProjectThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RFQ_ID = '44444444-4444-4444-8444-444444444444'
const RFQ_QUOTE_RESULT = {
  quoteId: '55555555-5555-4555-8555-555555555555',
  created: true,
  statusChanged: true,
}
const RFQ_TRANSITION_RESULT = {
  rfqId: RFQ_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  transitioned: true as const,
}
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps legacy writes active unless the flag and tenant allowlist both match', () => {
    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', '')
    vi.stubEnv(
      'ERP_PROJECT_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', 'false')
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', 'TRUE')
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API_TENANT_IDS', '')
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv(
      'ERP_PROJECT_WRITES_VIA_API_TENANT_IDS',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv(
      'ERP_PROJECT_WRITES_VIA_API_TENANT_IDS',
      ` ${RESULT.tenantId},aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa `
    )
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv(
      'ERP_PROJECT_WRITES_VIA_API_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_PROJECT_WRITES_VIA_API_TENANT_IDS', '*')
    expect(projectWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(projectWritesUseCoreApi('not-a-uuid')).toBe(false)
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

  it('keeps RFQ quote writes on the legacy path unless its exact flag and tenant match', () => {
    vi.stubEnv('ERP_RFQ_QUOTE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(rfqQuoteWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_RFQ_QUOTE_WRITES_VIA_API', 'TRUE')
    expect(rfqQuoteWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_QUOTE_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(rfqQuoteWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS', '*')
    expect(rfqQuoteWritesUseCoreApi(RESULT.tenantId)).toBe(true)
    expect(rfqQuoteWritesUseCoreApi('not-a-uuid')).toBe(false)
  })

  it('sends a strict RFQ quote command and validates the result', async () => {
    const command = {
      submissionId: '66666666-6666-4666-8666-666666666666',
      bomLineItemId: '77777777-7777-4777-8777-777777777777',
      vendorId: '88888888-8888-4888-8888-888888888888',
      unitPriceCents: 125_050,
      leadTimeDays: 14,
      validUntil: '2026-08-31T00:00:00.000Z',
      notes: 'Includes delivery',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RFQ_QUOTE_RESULT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      logRfqQuoteThroughCoreApi(RFQ_ID, command)
    ).resolves.toEqual({
      ok: true,
      data: RFQ_QUOTE_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/rfqs/${RFQ_ID}/quotes`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
      })
    )
  })

  it('keeps RFQ terminal writes legacy unless its independent gate matches', () => {
    vi.stubEnv('ERP_RFQ_TERMINAL_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS',
      RESULT.tenantId
    )
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(true)

    vi.stubEnv('ERP_RFQ_TERMINAL_WRITES_VIA_API', 'TRUE')
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_TERMINAL_WRITES_VIA_API', 'true')
    vi.stubEnv(
      'ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS',
      `*,${RESULT.tenantId}`
    )
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv(
      'ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS',
      'not-a-uuid'
    )
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(false)

    vi.stubEnv('ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS', '*')
    expect(rfqTerminalWritesUseCoreApi(RESULT.tenantId)).toBe(true)
  })

  it('sends a strict RFQ terminal command and validates the result', async () => {
    const command = {
      command: 'cancel' as const,
      reason: 'Supplier withdrew',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RFQ_TRANSITION_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      transitionRfqThroughCoreApi(RFQ_ID, command)
    ).resolves.toEqual({
      ok: true,
      data: RFQ_TRANSITION_RESULT,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/procurement/rfqs/${RFQ_ID}/transitions`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        cache: 'no-store',
      })
    )
  })

  it('fails closed on an invalid RFQ terminal result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...RFQ_TRANSITION_RESULT,
            transitioned: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    )

    await expect(
      transitionRfqThroughCoreApi(RFQ_ID, {
        command: 'complete',
      })
    ).resolves.toEqual({
      ok: false,
      error:
        'ERP Core API returned an invalid RFQ transition result.',
    })
  })
})
