import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import {
  getProjectCloseoutReadinessThroughCoreApi,
  projectCloseoutReadinessReadsUseCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RESULT = {
  projectId: PROJECT_ID,
  asOf: '2026-09-10T00:00:00.000Z',
  status: 'partial' as const,
  bonds: {
    total: 1,
    refunded: 0,
    open: 1,
    rows: [{
      permitId: '44444444-4444-4444-8444-444444444444',
      permitType: 'performance_bond' as const,
      status: 'approved' as const,
      expectedReturnAt: null,
      actualReturnAt: null,
      refundedAt: null,
    }],
  },
  retention: {
    invoiceCount: 2,
    retainedCentavos: 125000,
    allocatedCentavos: 100000,
    openCentavos: 25000,
  },
  pnlCloseoutStatus: 'unavailable' as const,
  blockers: ['1 bond record(s) remain without refund evidence.'],
  notes: ['Close-out readiness reports existing bond and retention evidence only; it does not infer contract release terms.'],
}

describe('project close-out readiness Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) },
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('validates identifiers and parses close-out evidence', async () => {
    await expect(getProjectCloseoutReadinessThroughCoreApi('not-a-uuid')).resolves.toMatchObject({ ok: false, status: 400 })
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(RESULT), { status: 200 }))
    await expect(getProjectCloseoutReadinessThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: true, data: { retention: { openCentavos: 25000 } } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/v1/projects/${PROJECT_ID}/closeout-readiness`), expect.objectContaining({ method: 'GET' }))
  })

  it('fails closed for malformed payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'partial' }), { status: 200 }))
    await expect(getProjectCloseoutReadinessThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('keeps the read canary exact-tenant', () => {
    vi.stubEnv('ERP_PROJECT_CLOSEOUT_READINESS_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_CLOSEOUT_READINESS_READS_VIA_API_TENANT_IDS', '*')
    expect(projectCloseoutReadinessReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(false)
    vi.stubEnv('ERP_PROJECT_CLOSEOUT_READINESS_READS_VIA_API_TENANT_IDS', '22222222-2222-4222-8222-222222222222')
    expect(projectCloseoutReadinessReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(true)
  })
})
