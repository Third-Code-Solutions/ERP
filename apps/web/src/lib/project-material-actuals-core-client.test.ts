import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import {
  getProjectMaterialActualsThroughCoreApi,
  projectMaterialActualsReadsUseCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const MATERIAL_ID = '44444444-4444-4444-8444-444444444444'
const RESULT = {
  projectId: PROJECT_ID,
  asOf: '2026-09-10T00:00:00.000Z',
  currency: 'PHP',
  status: 'ready' as const,
  rows: [{
    materialItemId: MATERIAL_ID,
    code: 'MAT-001',
    description: 'Concrete',
    unit: 'm3',
    receivedQuantityMicros: 10_000_000,
    issuedQuantityMicros: 4_000_000,
    receivedValueCents: 250_000,
    issuedValueCents: 100_000,
    receiptLineCount: 1,
    issueLineCount: 1,
    remainingQuantityMicros: 6_000_000,
    remainingValueCents: 150_000,
    notes: [],
  }],
  totals: {
    receiptCount: 1,
    issueCount: 1,
    receiptLineCount: 1,
    issueLineCount: 1,
    receivedQuantityMicros: 10_000_000,
    issuedQuantityMicros: 4_000_000,
    receivedValueCents: 250_000,
    issuedValueCents: 100_000,
    remainingQuantityMicros: 6_000_000,
    remainingValueCents: 150_000,
  },
  notes: ['SAP posting is not configured; no external accounting success is claimed.'],
}

describe('project material actuals Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) },
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('validates identifiers and parses the inventory evidence projection', async () => {
    await expect(getProjectMaterialActualsThroughCoreApi('not-a-uuid')).resolves.toMatchObject({ ok: false, status: 400 })
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(RESULT), { status: 200 }))
    await expect(getProjectMaterialActualsThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: true, data: { totals: { issuedValueCents: 100_000 } } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/v1/projects/${PROJECT_ID}/material-actuals`), expect.objectContaining({ method: 'GET' }))
  })

  it('fails closed for malformed payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ready' }), { status: 200 }))
    await expect(getProjectMaterialActualsThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('keeps the read canary exact-tenant', () => {
    vi.stubEnv('ERP_PROJECT_MATERIAL_ACTUALS_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_MATERIAL_ACTUALS_READS_VIA_API_TENANT_IDS', '*')
    expect(projectMaterialActualsReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(false)
    vi.stubEnv('ERP_PROJECT_MATERIAL_ACTUALS_READS_VIA_API_TENANT_IDS', '22222222-2222-4222-8222-222222222222')
    expect(projectMaterialActualsReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(true)
  })
})
