import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import { getProjectPerformanceThroughCoreApi } from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RESULT = {
  projectId: PROJECT_ID,
  asOf: '2026-09-10T00:00:00.000Z',
  currency: 'PHP',
  status: 'ready' as const,
  baselineCents: 1_000_000,
  plannedValueCents: 500_000,
  earnedValueCents: 400_000,
  actualCostCents: 350_000,
  estimateAtCompletionCents: 875_000,
  estimateToCompleteCents: 525_000,
  varianceAtCompletionCents: 125_000,
  costVarianceCents: 50_000,
  scheduleVarianceCents: -100_000,
  costPerformanceIndexBps: 11_429,
  schedulePerformanceIndexBps: 8_000,
  plannedPercentComplete: 50,
  actualPercentComplete: 40,
  latestProgressWeekEnding: '2026-09-06T00:00:00.000Z',
  progressSource: 'weekly_progress' as const,
  plannedValueSource: 'normalized_schedule_labor' as const,
  actualCostSource: 'posted_supplier_bills' as const,
  actualCostEvidenceCount: 4,
  missingEvidence: [],
  notes: [],
}

describe('project performance Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) },
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('validates identifiers and parses the EVM/CVR response', async () => {
    await expect(getProjectPerformanceThroughCoreApi('not-a-uuid')).resolves.toMatchObject({ ok: false, status: 400 })
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(RESULT), { status: 200 }))
    await expect(getProjectPerformanceThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: true, data: { earnedValueCents: 400_000 } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/v1/projects/${PROJECT_ID}/performance`), expect.objectContaining({ method: 'GET' }))
  })

  it('fails closed when Core returns a malformed payload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ready' }), { status: 200 }))
    await expect(getProjectPerformanceThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })
})
