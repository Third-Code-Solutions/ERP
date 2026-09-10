import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))
import {
  createQualityHoldPointThroughCoreApi,
  getQualityHoldPointsThroughCoreApi,
  handoffQualityHoldPointToPunchlistThroughCoreApi,
  mutateQualityHoldPointThroughCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'

const entry = {
  id: ENTRY_ID,
  projectId: PROJECT_ID,
  iwrNumber: 'IWR-0001',
  title: 'Concrete pour inspection',
  description: 'Verify reinforcement before the pour.',
  discipline: 'Structural',
  location: 'Level 2 slab',
  planReference: 'S-201 detail 4',
  holdPoint: true,
  inspectionDate: '2026-09-12',
  status: 'planned',
  requestNotes: '',
  findings: '',
  rejectionReason: '',
  acceptanceNotes: '',
  requestedBy: '11111111-1111-4111-8111-111111111111',
  assignedTo: null,
  submittedAt: null,
  submittedBy: null,
  acceptedAt: null,
  acceptedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  punchlistHandoffAt: null,
  punchlistHandoffBy: null,
  version: 1,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
} as const

describe('quality hold point Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }) },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      projectId: PROJECT_ID,
      rows: [entry],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
  })

  it('validates list responses and persists query filters', async () => {
    const result = await getQualityHoldPointsThroughCoreApi(PROJECT_ID, { status: 'planned', holdPoint: true })
    expect(result).toMatchObject({ ok: true, data: { total: 1 } })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/projects/33333333-3333-4333-8333-333333333333/quality?status=planned&holdPoint=true&page=1&limit=25'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('rejects malformed commands before network access', async () => {
    const result = await createQualityHoldPointThroughCoreApi({ projectId: PROJECT_ID })
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('routes transition targets to the matching Core path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      projectId: PROJECT_ID,
      changed: true,
      entry: { ...entry, status: 'submitted', version: 2, requestNotes: 'Inspect before pour.', submittedAt: '2026-09-10T01:00:00.000Z', submittedBy: '11111111-1111-4111-8111-111111111111' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const result = await mutateQualityHoldPointThroughCoreApi(PROJECT_ID, ENTRY_ID, 'submit', {
      expectedVersion: 1,
      requestNotes: 'Inspect before pour.',
    })
    expect(result).toMatchObject({ ok: true, data: { entry: { iwrNumber: 'IWR-0001' } } })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/v1/projects/${PROJECT_ID}/quality/${ENTRY_ID}/submit`),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('accepts a valid create command and keeps the replay token in the payload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      projectId: PROJECT_ID,
      created: true,
      changed: true,
      entry,
    }), { status: 201, headers: { 'content-type': 'application/json' } }))
    const result = await createQualityHoldPointThroughCoreApi({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      title: entry.title,
      description: entry.description,
      discipline: entry.discipline,
      location: entry.location,
      planReference: entry.planReference,
      holdPoint: true,
      inspectionDate: entry.inspectionDate,
      assignedTo: null,
    })
    expect(result).toMatchObject({ ok: true, data: { created: true } })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/v1/projects/${PROJECT_ID}/quality`),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining(REQUEST_ID) }),
    )
  })

  it('posts a rejected-IWR punchlist handoff and validates the linked rows', async () => {
    const handoffId = '66666666-6666-4666-8666-666666666666'
    const itemId = '77777777-7777-4777-8777-777777777777'
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      projectId: PROJECT_ID,
      qualityHoldPointId: ENTRY_ID,
      handoffId,
      created: true,
      changed: true,
      source: {
        qualityHoldPointId: ENTRY_ID,
        iwrNumber: entry.iwrNumber,
        findings: 'Membrane blistering.',
        rejectionReason: 'Repair before concealment.',
        planDocumentId: null,
      },
      items: [{
        id: itemId,
        projectId: PROJECT_ID,
        description: 'Repair the failed inspection item.',
        location: null,
        trade: null,
        priority: 'medium',
        status: 'open',
        dueDate: null,
        assignedToUserId: null,
        assignedToText: null,
        createdAt: '2026-09-10T02:00:00.000Z',
        createdBy: '11111111-1111-4111-8111-111111111111',
        sourceHandoffId: handoffId,
      }],
    }), { status: 201, headers: { 'content-type': 'application/json' } }))
    const result = await handoffQualityHoldPointToPunchlistThroughCoreApi(
      PROJECT_ID,
      ENTRY_ID,
      { clientRequestId: REQUEST_ID, planDocumentId: null, items: [{ description: 'Repair the failed inspection item.' }] },
    )
    expect(result).toMatchObject({ ok: true, data: { created: true, items: [{ id: itemId, sourceHandoffId: handoffId }] } })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/v1/projects/${PROJECT_ID}/quality/${ENTRY_ID}/punchlist`),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining(REQUEST_ID) }),
    )
  })
})
