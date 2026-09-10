import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import {
  getProjectLabourReconciliationThroughCoreApi,
  projectLabourReconciliationReadsUseCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TASK_ID = '44444444-4444-4444-8444-444444444444'
const RESULT = {
  projectId: PROJECT_ID,
  asOf: '2026-09-10T00:00:00.000Z',
  status: 'ready' as const,
  rows: [{
    taskId: TASK_ID,
    level: 'l1' as const,
    taskCode: 'L1-001',
    name: 'Mobilize',
    taskStatus: 'in_progress' as const,
    plannedLaborMinutes: 1_000,
    actualLaborMinutes: 800,
    varianceMinutes: -200,
    utilizationBps: 8_000,
    evidence: 'reported' as const,
    notes: [],
  }],
  totals: {
    taskCount: 1,
    plannedLaborMinutes: 1_000,
    actualLaborMinutes: 800,
    varianceMinutes: -200,
    reportedTaskCount: 1,
    missingEvidenceTaskCount: 0,
  },
  notes: ['Minutes are reconciled as captured schedule evidence.'],
}

describe('project labour reconciliation Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) },
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('validates identifiers and parses the reconciliation response', async () => {
    await expect(getProjectLabourReconciliationThroughCoreApi('not-a-uuid')).resolves.toMatchObject({ ok: false, status: 400 })
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(RESULT), { status: 200 }))
    await expect(getProjectLabourReconciliationThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: true, data: { totals: { varianceMinutes: -200 } } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/v1/projects/${PROJECT_ID}/labour-reconciliation`), expect.objectContaining({ method: 'GET' }))
  })

  it('fails closed for malformed payloads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ready' }), { status: 200 }))
    await expect(getProjectLabourReconciliationThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('keeps the read canary exact-tenant', () => {
    vi.stubEnv('ERP_PROJECT_LABOUR_RECONCILIATION_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_LABOUR_RECONCILIATION_READS_VIA_API_TENANT_IDS', '*')
    expect(projectLabourReconciliationReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(false)
    vi.stubEnv('ERP_PROJECT_LABOUR_RECONCILIATION_READS_VIA_API_TENANT_IDS', '22222222-2222-4222-8222-222222222222')
    expect(projectLabourReconciliationReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(true)
  })
})
