import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import {
  createProjectWeeklyProgressThroughCoreApi,
  getProjectWeeklyProgressThroughCoreApi,
  lockProjectWeeklyProgressThroughCoreApi,
  projectWeeklyProgressReadsUseCoreApi,
  projectWeeklyProgressWritesUseCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PERIOD_ID = '44444444-4444-4444-8444-444444444444'
const PROGRESS_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PERCENTAGES = { civil_pct: 40, electrical_pct: 50, mep_pct: 30, finishes_pct: 20, overall_pct: 35 }
const ROW = {
  id: PERIOD_ID,
  projectId: PROJECT_ID,
  progressUpdateId: PROGRESS_ID,
  clientRequestId: REQUEST_ID,
  weekEnding: '2026-09-13',
  cutoffAt: '2026-09-17T09:00:00.000Z',
  status: 'open' as const,
  percentByCategory: PERCENTAGES,
  notes: 'WAR evidence',
  warSnapshot: null,
  lockedAt: null,
  lockedBy: null,
  lockReason: '',
  version: 1,
  createdBy: USER_ID,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
}

describe('project weekly progress Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) },
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('reads the WAR ledger and routes capture/lock commands', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, rows: [ROW], total: 1, page: 1, limit: 25, totalPages: 1 }), { status: 200 }))
    await expect(getProjectWeeklyProgressThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: true, data: { rows: [{ status: 'open' }] } })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, created: true, changed: true, row: ROW }), { status: 201 }))
    await expect(createProjectWeeklyProgressThroughCoreApi({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, weekEnding: '2026-09-13', percentByCategory: PERCENTAGES, notes: 'WAR evidence' })).resolves.toMatchObject({ ok: true, data: { created: true } })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, changed: true, row: { ...ROW, status: 'locked', version: 2, lockedAt: '2026-09-17T09:00:00.000Z', lockedBy: USER_ID, lockReason: 'cut-off', warSnapshot: { weekEnding: ROW.weekEnding, overallPct: 35, percentByCategory: PERCENTAGES, notes: ROW.notes, capturedAt: '2026-09-17T09:00:00.000Z' } } }), { status: 200 }))
    await expect(lockProjectWeeklyProgressThroughCoreApi(PROJECT_ID, PERIOD_ID, { expectedVersion: 1, lockReason: 'cut-off' })).resolves.toMatchObject({ ok: true, data: { row: { status: 'locked' } } })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('fails closed on malformed identifiers and Core responses', async () => {
    await expect(getProjectWeeklyProgressThroughCoreApi('bad-id')).resolves.toMatchObject({ ok: false, status: 400 })
    await expect(createProjectWeeklyProgressThroughCoreApi({ projectId: PROJECT_ID })).resolves.toMatchObject({ ok: false, status: 400 })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, rows: [] }), { status: 200 }))
    await expect(getProjectWeeklyProgressThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('keeps read canaries exact-tenant while allowing explicit write tenant selection', () => {
    vi.stubEnv('ERP_PROJECT_WEEKLY_PROGRESS_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_WEEKLY_PROGRESS_READS_VIA_API_TENANT_IDS', '*')
    expect(projectWeeklyProgressReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(false)
    vi.stubEnv('ERP_PROJECT_WEEKLY_PROGRESS_READS_VIA_API_TENANT_IDS', '22222222-2222-4222-8222-222222222222')
    expect(projectWeeklyProgressReadsUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(true)
    vi.stubEnv('ERP_PROJECT_WEEKLY_PROGRESS_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_WEEKLY_PROGRESS_WRITES_VIA_API_TENANT_IDS', '*')
    expect(projectWeeklyProgressWritesUseCoreApi('22222222-2222-4222-8222-222222222222')).toBe(true)
  })
})
