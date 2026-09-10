import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createProjectRfiThroughCoreApi,
  getProjectRfisThroughCoreApi,
  transitionProjectRfiThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RFI_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const USER_ID = '66666666-6666-4666-8666-666666666666'
const NOW = '2026-09-10T10:00:00.000Z'

const RFI = {
  id: RFI_ID,
  projectId: PROJECT_ID,
  rfiNumber: 'RFI-0001',
  subject: 'Confirm slab opening',
  question: 'Please confirm the coordinated opening size.',
  priority: 'high' as const,
  status: 'open' as const,
  requestedBy: USER_ID,
  assignedTo: null,
  dueAt: null,
  response: null,
  respondedAt: null,
  respondedBy: null,
  closedAt: null,
  closedBy: null,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
}

describe('project RFI Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reads bounded filters through Core', async () => {
    const result = { projectId: PROJECT_ID, rows: [RFI], total: 1, page: 2, limit: 10, totalPages: 1 }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProjectRfisThroughCoreApi(PROJECT_ID, { status: 'open', priority: 'high', page: 2, limit: 10 })).resolves.toEqual({ ok: true, data: result })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/rfis?status=open&priority=high&page=2&limit=10`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
  })

  it('rejects invalid input before network access', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getProjectRfisThroughCoreApi(PROJECT_ID, { status: 'resolved' })).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Invalid project RFI filters.',
    })
    await expect(createProjectRfiThroughCoreApi({ projectId: PROJECT_ID })).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Invalid project RFI command.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates once with a stable client request token', async () => {
    const result = { projectId: PROJECT_ID, created: true, rfi: RFI }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(createProjectRfiThroughCoreApi({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      subject: 'Confirm slab opening',
      question: 'Please confirm the coordinated opening size.',
      priority: 'high',
      assignedTo: null,
      dueAt: null,
    })).resolves.toEqual({ ok: true, data: result })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/rfis`,
      expect.objectContaining({ method: 'POST', body: expect.stringContaining(REQUEST_ID) }),
    )
  })

  it('preserves stale conflicts and unconfirmed timeout outcomes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'RFI changed' }), { status: 409 })))
    await expect(transitionProjectRfiThroughCoreApi(PROJECT_ID, RFI_ID, 'close', { expectedVersion: 1, reason: 'Done' })).resolves.toEqual({ ok: false, status: 409, error: 'RFI changed' })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    await expect(transitionProjectRfiThroughCoreApi(PROJECT_ID, RFI_ID, 'answer', { expectedVersion: 1, response: 'Answer' })).resolves.toEqual({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. Project RFI transition outcome is unconfirmed; refresh before retrying.',
    })
  })
})
