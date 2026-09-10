import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import {
  getVendorPerformanceThroughCoreApi,
  vendorPerformanceReadsUseCoreApi,
} from './erp-core-client'

const VENDOR_ID = '44444444-4444-4444-8444-444444444444'
const RESULT = {
  asOf: '2026-09-10T00:00:00.000Z',
  projectId: null,
  rows: [{
    vendorId: VENDOR_ID,
    vendorName: 'Concrete Supply',
    poCount: 1,
    issuedPoCount: 1,
    openPoCount: 0,
    committedCents: 100_000,
    deliveryCount: 1,
    acceptedDeliveryCount: 1,
    rejectedDeliveryCount: 0,
    onTimeDeliveryCount: 1,
    onTimeRateBps: 10_000,
    acceptanceRateBps: 10_000,
    averageLeadTimeDays: 4,
    supplierBillCount: 1,
    postedBillCount: 1,
    postedSpendCents: 100_000,
    risk: 'good' as const,
    notes: [],
  }],
  totals: {
    vendorCount: 1,
    vendorsWithOrders: 1,
    atRiskCount: 0,
    committedCents: 100_000,
    postedSpendCents: 100_000,
  },
}

describe('vendor performance Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) },
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('validates and parses the source-evidence projection', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(RESULT), { status: 200 }))
    await expect(getVendorPerformanceThroughCoreApi()).resolves.toMatchObject({ ok: true, data: { totals: { vendorCount: 1 } } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/v1/procurement/vendors/performance?'), expect.objectContaining({ method: 'GET' }))
  })

  it('fails closed for malformed payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }))
    await expect(getVendorPerformanceThroughCoreApi()).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('keeps the read canary exact-tenant', () => {
    vi.stubEnv('ERP_VENDOR_PERFORMANCE_READS_VIA_API', 'true')
    vi.stubEnv('ERP_VENDOR_PERFORMANCE_READS_VIA_API_TENANT_IDS', '*')
    expect(vendorPerformanceReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(false)
    vi.stubEnv('ERP_VENDOR_PERFORMANCE_READS_VIA_API_TENANT_IDS', '22222222-2222-4222-8222-222222222222')
    expect(vendorPerformanceReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(true)
  })
})
