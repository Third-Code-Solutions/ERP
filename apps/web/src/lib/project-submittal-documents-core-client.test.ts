import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))
import {
  getProjectDocumentsThroughCoreApi,
  getProjectSubmittalDocumentsThroughCoreApi,
  linkProjectSubmittalDocumentThroughCoreApi,
  unlinkProjectSubmittalDocumentThroughCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const SUBMITTAL_ID = '44444444-4444-4444-8444-444444444444'
const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'
const LINK_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '77777777-7777-4777-8777-777777777777'
const LINK = { id: LINK_ID, projectId: PROJECT_ID, submittalId: SUBMITTAL_ID, documentId: DOCUMENT_ID, role: 'plan' as const, caption: 'M-202', fileName: 'M-202.pdf', documentType: 'pdf' as const, mimeType: 'application/pdf', sizeBytes: 42, description: null, linkedBy: '11111111-1111-4111-8111-111111111111', createdAt: '2026-09-10T00:00:00.000Z' }

describe('project submittal document Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) } })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('reads project documents and linked CDE rows', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, rows: [{ id: DOCUMENT_ID, projectId: PROJECT_ID, fileName: 'M-202.pdf', documentType: 'pdf', mimeType: 'application/pdf', sizeBytes: 42, description: null, createdAt: LINK.createdAt }], total: 1, page: 1, limit: 50, totalPages: 1 }), { status: 200 }))
    await expect(getProjectDocumentsThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: true, data: { total: 1 } })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, submittalId: SUBMITTAL_ID, rows: [LINK] }), { status: 200 }))
    await expect(getProjectSubmittalDocumentsThroughCoreApi(PROJECT_ID, SUBMITTAL_ID)).resolves.toMatchObject({ ok: true, data: { rows: [LINK] } })
  })

  it('routes link and unlink commands and validates malformed input locally', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, submittalId: SUBMITTAL_ID, changed: true, submittalVersion: 2, link: LINK }), { status: 201 }))
    await expect(linkProjectSubmittalDocumentThroughCoreApi(PROJECT_ID, SUBMITTAL_ID, { documentId: DOCUMENT_ID, role: 'plan', caption: 'M-202', expectedVersion: 1, clientRequestId: REQUEST_ID })).resolves.toMatchObject({ ok: true, data: { link: LINK } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/submittals/${SUBMITTAL_ID}/documents`), expect.objectContaining({ method: 'POST', body: expect.stringContaining(REQUEST_ID) }))
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, submittalId: SUBMITTAL_ID, changed: true, submittalVersion: 3, linkId: LINK_ID }), { status: 200 }))
    await expect(unlinkProjectSubmittalDocumentThroughCoreApi(PROJECT_ID, SUBMITTAL_ID, LINK_ID, { expectedVersion: 2 })).resolves.toMatchObject({ ok: true, data: { linkId: LINK_ID } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/documents/${LINK_ID}/unlink`), expect.objectContaining({ method: 'POST' }))
    await expect(linkProjectSubmittalDocumentThroughCoreApi(PROJECT_ID, SUBMITTAL_ID, { documentId: 'bad' })).resolves.toMatchObject({ ok: false, status: 400 })
  })
})
