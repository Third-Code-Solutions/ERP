import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import {
  getProjectHandoverReadinessThroughCoreApi,
  projectHandoverReadinessReadsUseCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RESULT = {
  projectId: PROJECT_ID,
  asOf: '2026-09-10T00:00:00.000Z',
  status: 'partial' as const,
  turnoverPackageExists: true,
  turnoverCompiled: false,
  attachedSlotCount: 2,
  requiredSlotCount: 4,
  cocStatus: 'draft' as const,
  totalPunchlistCount: 3,
  openPunchlistCount: 1,
  occupancyPermitStatus: 'under_review' as const,
  blockers: ['Turnover package is missing 2 required document slot(s).'],
  notes: ['Evidence gate.'],
}

describe('project handover readiness Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) },
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('validates identifiers and parses readiness evidence', async () => {
    await expect(getProjectHandoverReadinessThroughCoreApi('not-a-uuid')).resolves.toMatchObject({ ok: false, status: 400 })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(RESULT), { status: 200 }))
    await expect(getProjectHandoverReadinessThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: true, data: { openPunchlistCount: 1 } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/v1/projects/${PROJECT_ID}/handover-readiness`), expect.objectContaining({ method: 'GET' }))
  })

  it('fails closed for malformed payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'partial' }), { status: 200 }))
    await expect(getProjectHandoverReadinessThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('keeps the read canary exact-tenant', () => {
    vi.stubEnv('ERP_PROJECT_HANDOVER_READINESS_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_HANDOVER_READINESS_READS_VIA_API_TENANT_IDS', '*')
    expect(projectHandoverReadinessReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(false)
    vi.stubEnv('ERP_PROJECT_HANDOVER_READINESS_READS_VIA_API_TENANT_IDS', '22222222-2222-4222-8222-222222222222')
    expect(projectHandoverReadinessReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(true)
  })
})
