import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSiteDiaryThroughCoreApi,
  getSiteDiaryThroughCoreApi,
  mutateSiteDiaryThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: vi.fn() }))

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const NOW = '2026-09-10T10:00:00.000Z'

const ENTRY = {
  id: ENTRY_ID,
  projectId: PROJECT_ID,
  diaryDate: '2026-09-10',
  status: 'draft' as const,
  weather: 'Cloudy',
  manpowerCount: 14,
  workCompleted: 'MEP rough-in progressed.',
  constraints: '',
  safetyNotes: 'PPE checked.',
  createdBy: USER_ID,
  submittedAt: null,
  submittedBy: null,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
}

describe('site diary Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }) },
    } as never)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads date/status filters through Core', async () => {
    const result = { projectId: PROJECT_ID, rows: [ENTRY], total: 1, page: 1, limit: 25, totalPages: 1 }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getSiteDiaryThroughCoreApi(PROJECT_ID, { status: 'draft', fromDate: '2026-09-01', toDate: '2026-09-30' })).resolves.toEqual({ ok: true, data: result })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/diary?status=draft&fromDate=2026-09-01&toDate=2026-09-30&page=1&limit=25`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
  })

  it('rejects invalid input before a network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getSiteDiaryThroughCoreApi(PROJECT_ID, { fromDate: '2026-09-30', toDate: '2026-09-01' })).resolves.toMatchObject({ ok: false, status: 400 })
    await expect(createSiteDiaryThroughCoreApi({ projectId: PROJECT_ID })).resolves.toMatchObject({ ok: false, status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates and submits with strict envelopes', async () => {
    const createResult = { projectId: PROJECT_ID, created: true, changed: true, entry: ENTRY }
    const mutationResult = { projectId: PROJECT_ID, changed: true, entry: { ...ENTRY, status: 'submitted' as const, version: 2, submittedAt: NOW, submittedBy: USER_ID } }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(createResult), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mutationResult), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(createSiteDiaryThroughCoreApi({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      weather: 'Cloudy',
      manpowerCount: 14,
      workCompleted: 'MEP rough-in progressed.',
      constraints: '',
      safetyNotes: 'PPE checked.',
    })).resolves.toEqual({ ok: true, data: createResult })
    await expect(mutateSiteDiaryThroughCoreApi(PROJECT_ID, ENTRY_ID, 'submit', { expectedVersion: 1 })).resolves.toEqual({ ok: true, data: mutationResult })
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/diary/${ENTRY_ID}/submit`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('preserves stale and unconfirmed outcomes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Diary changed' }), { status: 409 })))
    await expect(mutateSiteDiaryThroughCoreApi(PROJECT_ID, ENTRY_ID, 'update', {
      expectedVersion: 1,
      weather: '',
      manpowerCount: 0,
      workCompleted: 'Work',
      constraints: '',
      safetyNotes: '',
    })).resolves.toEqual({ ok: false, status: 409, error: 'Diary changed' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    await expect(mutateSiteDiaryThroughCoreApi(PROJECT_ID, ENTRY_ID, 'submit', { expectedVersion: 1 })).resolves.toMatchObject({ ok: false, status: 503, error: expect.stringContaining('unconfirmed') })
  })
})
