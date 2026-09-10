import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import { getRfqBidLevelingThroughCoreApi, rfqBidLevelingReadsUseCoreApi } from './erp-core-client'

const RFQ_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const LINE_ID = '33333333-3333-4333-8333-333333333333'

const RESULT = {
  rfqId: RFQ_ID,
  projectId: PROJECT_ID,
  status: 'quotes_received' as const,
  asOf: '2026-09-10T00:00:00.000Z',
  staleAfterDays: 90 as const,
  lines: [{
    lineKey: LINE_ID,
    bomLineItemId: LINE_ID,
    materialItemId: null,
    code: 'CEM-001',
    description: 'Cement',
    quantity: 2,
    unit: 'bag',
    quotes: [],
    lowestUnitPriceCents: null,
  }],
  vendorCount: 0,
  coveredLineCount: 0,
  totalLineCount: 1,
  staleQuoteCount: 0,
  awardedQuoteCount: 0,
}

describe('RFQ bid-leveling Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) } })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('validates the RFQ id and response', async () => {
    await expect(getRfqBidLevelingThroughCoreApi('bad')).resolves.toMatchObject({ ok: false, status: 400 })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(RESULT), { status: 200 }))
    await expect(getRfqBidLevelingThroughCoreApi(RFQ_ID)).resolves.toMatchObject({ ok: true, data: { totalLineCount: 1 } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/v1/procurement/rfqs/${RFQ_ID}/bid-leveling`), expect.objectContaining({ method: 'GET' }))
  })

  it('fails closed for malformed payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ rfqId: RFQ_ID }), { status: 200 }))
    await expect(getRfqBidLevelingThroughCoreApi(RFQ_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('rejects wildcard canaries', () => {
    vi.stubEnv('ERP_RFQ_BID_LEVELING_READS_VIA_API', 'true')
    vi.stubEnv('ERP_RFQ_BID_LEVELING_READS_VIA_API_TENANT_IDS', '*')
    expect(rfqBidLevelingReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(false)
  })
})
