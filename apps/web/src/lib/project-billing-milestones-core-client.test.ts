import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import {
  getProjectBillingMilestonesThroughCoreApi,
  projectBillingMilestoneReadsUseCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'
const COC_ID = '55555555-5555-4555-8555-555555555555'

const RESULT = {
  projectId: PROJECT_ID,
  coc: { id: COC_ID, status: 'signed' as const, signedAt: '2026-09-17T09:00:00.000Z' },
  rows: [{
    claimId: CLAIM_ID,
    claimNumber: 'PC-00001',
    milestonePct: 50,
    amountCents: 100_000,
    claimStatus: 'handed_over_finance' as const,
    certificateDocumentId: null,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    cocStatus: 'signed' as const,
    evidence: { lockedWarPeriods: 1, latestWarWeekEnding: '2026-09-13', latestWarOverallPct: 50 },
    readyForInvoice: true,
    blockers: [],
  }],
  total: 1,
  page: 1,
  limit: 25,
  totalPages: 1,
}

describe('project billing milestone Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) } })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('reads the linked milestone chain and validates the response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(RESULT), { status: 200 }))
    await expect(getProjectBillingMilestonesThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: true, data: { rows: [{ readyForInvoice: true }] } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/v1/projects/${PROJECT_ID}/billing/milestones?page=1&limit=25`), expect.objectContaining({ method: 'GET' }))
  })

  it('fails closed for invalid identifiers and malformed payloads', async () => {
    await expect(getProjectBillingMilestonesThroughCoreApi('bad-id')).resolves.toMatchObject({ ok: false, status: 400 })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }))
    await expect(getProjectBillingMilestonesThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it.each(['client construction', 'session lookup'])('returns 503 without fetching when %s throws', async (failure) => {
    if (failure === 'client construction') {
      mocks.createSupabaseServerClient.mockRejectedValueOnce(new Error('client unavailable'))
    } else {
      mocks.createSupabaseServerClient.mockResolvedValueOnce({ auth: { getSession: vi.fn().mockRejectedValueOnce(new Error('session unavailable')) } })
    }

    await expect(getProjectBillingMilestonesThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the traceability read canary exact-tenant', () => {
    vi.stubEnv('ERP_PROJECT_BILLING_MILESTONE_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_BILLING_MILESTONE_READS_VIA_API_TENANT_IDS', '*')
    expect(projectBillingMilestoneReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(false)
    vi.stubEnv('ERP_PROJECT_BILLING_MILESTONE_READS_VIA_API_TENANT_IDS', '22222222-2222-4222-8222-222222222222')
    expect(projectBillingMilestoneReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(true)
  })

  it.each([
    ['other project', { projectId: COC_ID }],
    ['wrong page', { page: 2 }],
    ['wrong page size', { limit: 10 }],
    ['invalid page count', { totalPages: 2 }],
    ['duplicate claims', { rows: [RESULT.rows[0], RESULT.rows[0]], total: 2 }],
    ['too many rows', { rows: Array.from({ length: 26 }, () => RESULT.rows[0]), total: 26, totalPages: 2 }],
  ])('rejects %s rather than rendering unbound pagination evidence', async (_label, changes) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ...RESULT, ...changes }), { status: 200 }))
    await expect(getProjectBillingMilestonesThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('supports a last page and an empty out-of-range page without inventing rows', async () => {
    const last = { ...RESULT, page: 2, total: 26, totalPages: 2 }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(last), { status: 200 }))
    await expect(getProjectBillingMilestonesThroughCoreApi(PROJECT_ID, { page: 2, limit: 25 })).resolves.toEqual({ ok: true, data: last })
    const empty = { ...last, page: 3, rows: [] }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(empty), { status: 200 }))
    await expect(getProjectBillingMilestonesThroughCoreApi(PROJECT_ID, { page: 3, limit: 25 })).resolves.toEqual({ ok: true, data: empty })
  })

  it.each([{ page: 0 }, { page: 100001 }, { page: ['1', '2'] }, { limit: 101 }])('rejects invalid pagination before access or network use: %j', async (query) => {
    await expect(getProjectBillingMilestonesThroughCoreApi(PROJECT_ID, query)).resolves.toMatchObject({ ok: false, status: 400 })
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
  })
})
