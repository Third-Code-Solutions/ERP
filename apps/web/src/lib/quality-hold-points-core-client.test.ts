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
const HANDOFF_ID = '66666666-6666-4666-8666-666666666666'
const ITEM_ID = '77777777-7777-4777-8777-777777777777'
const DOCUMENT_ID = '88888888-8888-4888-8888-888888888888'
const OTHER_PROJECT_ID = '99999999-9999-4999-8999-999999999999'
const OTHER_ENTRY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_HANDOFF_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OTHER_ITEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

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
    mocks.createSupabaseServerClient.mockClear()
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
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      clientRequestId: REQUEST_ID,
      projectId: PROJECT_ID,
      qualityHoldPointId: ENTRY_ID,
      handoffId: HANDOFF_ID,
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
        id: ITEM_ID,
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
        sourceHandoffId: HANDOFF_ID,
      }],
    }), { status: 201, headers: { 'content-type': 'application/json' } }))
    const result = await handoffQualityHoldPointToPunchlistThroughCoreApi(
      PROJECT_ID,
      ENTRY_ID,
      { clientRequestId: REQUEST_ID, planDocumentId: null, items: [{ description: 'Repair the failed inspection item.' }] },
    )
    expect(result).toMatchObject({ ok: true, data: { created: true, clientRequestId: REQUEST_ID, items: [{ id: ITEM_ID, sourceHandoffId: HANDOFF_ID }] }, outcome: 'confirmed' })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/v1/projects/${PROJECT_ID}/quality/${ENTRY_ID}/punchlist`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-erp-receipt-version': '1' }),
        body: expect.stringContaining(REQUEST_ID),
      }),
    )
  })

  it.each(['client construction', 'session lookup'])('rejects before dispatch when Core access %s throws', async (failure) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    if (failure === 'client construction') {
      mocks.createSupabaseServerClient.mockRejectedValueOnce(new Error('client unavailable'))
    } else {
      mocks.createSupabaseServerClient.mockResolvedValueOnce({
        auth: { getSession: vi.fn().mockRejectedValueOnce(new Error('session unavailable')) },
      })
    }

    await expect(handoffQualityHoldPointToPunchlistThroughCoreApi(PROJECT_ID, ENTRY_ID, {
      clientRequestId: REQUEST_ID,
      planDocumentId: null,
      items: [{ description: 'Repair the failed inspection item.' }],
    })).resolves.toMatchObject({ ok: false, status: 503, outcome: 'rejected' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid input before obtaining Core access', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(handoffQualityHoldPointToPunchlistThroughCoreApi('not-a-uuid', ENTRY_ID, {
      clientRequestId: REQUEST_ID,
      planDocumentId: null,
      items: [{ description: 'Repair the failed inspection item.' }],
    })).resolves.toMatchObject({ ok: false, status: 400, outcome: 'rejected' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it.each([
    ['400', 400, 'Rejected by policy.'],
    ['401', 401, 'Sign-in required.'],
    ['403', 403, 'Not allowed.'],
    ['404', 404, 'Quality request or plan document was not found.'],
    ['409', 409, 'Already handed off.'],
    ['422', 422, 'Invalid handoff state.'],
  ])('classifies HTTP %s as a known rejection', async (_label, status, message) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message }), { status }))

    await expect(handoffQualityHoldPointToPunchlistThroughCoreApi(PROJECT_ID, ENTRY_ID, {
      clientRequestId: REQUEST_ID,
      planDocumentId: null,
      items: [{ description: 'Repair the failed inspection item.' }],
    })).resolves.toEqual({ ok: false, status, error: message, outcome: 'rejected' })
  })

  it.each([
    ['transport', () => vi.mocked(fetch).mockRejectedValueOnce(new Error('network timeout'))],
    ['408', () => vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Request timed out.' }), { status: 408 }))],
    ['500', () => vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Database unavailable.' }), { status: 500 }))],
  ])('keeps %s outcome uncertain after dispatch', async (_label, arrange) => {
    arrange()

    await expect(handoffQualityHoldPointToPunchlistThroughCoreApi(PROJECT_ID, ENTRY_ID, {
      clientRequestId: REQUEST_ID,
      planDocumentId: null,
      items: [{ description: 'Repair the failed inspection item.' }],
    })).resolves.toMatchObject({ ok: false, status: expect.any(Number), outcome: 'unknown' })
  })

  it('rejects malformed or mismatched successful responses without claiming confirmation', async () => {
    const base = {
      clientRequestId: REQUEST_ID,
      projectId: PROJECT_ID,
      qualityHoldPointId: ENTRY_ID,
      handoffId: HANDOFF_ID,
      created: true,
      changed: true,
      source: {
        qualityHoldPointId: ENTRY_ID,
        iwrNumber: entry.iwrNumber,
        findings: 'Membrane blistering.',
        rejectionReason: 'Repair before concealment.',
        planDocumentId: DOCUMENT_ID,
      },
      items: [{
        id: ITEM_ID,
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
        sourceHandoffId: HANDOFF_ID,
      }],
    }
    const invalidResponses = [
      { ...base, clientRequestId: undefined },
      { ...base, clientRequestId: OTHER_ENTRY_ID },
      { ...base, projectId: OTHER_PROJECT_ID },
      { ...base, qualityHoldPointId: OTHER_ENTRY_ID },
      { ...base, source: { ...base.source, qualityHoldPointId: OTHER_ENTRY_ID } },
      { ...base, source: { ...base.source, planDocumentId: OTHER_ENTRY_ID } },
      { ...base, items: [{ ...base.items[0], projectId: OTHER_PROJECT_ID }] },
      { ...base, items: [{ ...base.items[0], sourceHandoffId: OTHER_HANDOFF_ID }] },
      { ...base, items: [{ ...base.items[0], id: OTHER_ITEM_ID }, { ...base.items[0], id: OTHER_ITEM_ID.toUpperCase() }] },
      { ...base, items: [] },
    ]
    for (const invalidResponse of invalidResponses) {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(invalidResponse), { status: 201 }))
      await expect(handoffQualityHoldPointToPunchlistThroughCoreApi(PROJECT_ID, ENTRY_ID, {
        clientRequestId: REQUEST_ID,
        planDocumentId: DOCUMENT_ID,
        items: [{ description: 'Repair the failed inspection item.' }],
      })).resolves.toMatchObject({ ok: false, status: 503, outcome: 'unknown' })
    }
  })

  it('confirms a replay with mutable item fields changed but bound identities intact', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      clientRequestId: REQUEST_ID.toUpperCase(),
      projectId: PROJECT_ID.toUpperCase(),
      qualityHoldPointId: ENTRY_ID.toUpperCase(),
      handoffId: HANDOFF_ID,
      created: false,
      changed: false,
      source: {
        qualityHoldPointId: ENTRY_ID.toUpperCase(),
        iwrNumber: 'IWR-REPLAYED',
        findings: 'Updated server finding.',
        rejectionReason: 'Updated server reason.',
        planDocumentId: null,
      },
      items: [{
        id: ITEM_ID,
        projectId: PROJECT_ID.toUpperCase(),
        description: 'Server-owned replayed correction.',
        location: 'North wall',
        trade: 'Waterproofing',
        priority: 'high',
        status: 'in_progress',
        dueDate: '2026-09-20T00:00:00.000Z',
        assignedToUserId: null,
        assignedToText: 'Site team',
        createdAt: '2026-09-10T02:00:00.000Z',
        createdBy: '11111111-1111-4111-8111-111111111111',
        sourceHandoffId: HANDOFF_ID.toUpperCase(),
      }],
    }), { status: 200 }))

    await expect(handoffQualityHoldPointToPunchlistThroughCoreApi(PROJECT_ID, ENTRY_ID, {
      clientRequestId: REQUEST_ID,
      planDocumentId: null,
      items: [{ description: 'Original client description.' }],
    })).resolves.toMatchObject({ ok: true, outcome: 'confirmed', data: { changed: false, source: { iwrNumber: 'IWR-REPLAYED' } } })
  })
})
