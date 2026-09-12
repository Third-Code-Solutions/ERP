import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  attachClaimDocumentThroughCoreApi,
  getProjectDocumentsThroughCoreApi,
} from './erp-core-client'
import type { ProjectDocumentListResult, ProjectDocumentRow } from '@third-code-erp/shared-types'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const PROJECT_ID = 'abcdefab-1234-4abc-8def-abcdefabcdef'
const CLAIM_ID = 'fedcba98-7654-4fed-8cba-fedcba987654'
const DOCUMENT_ID = 'abcdef12-3456-4abc-8def-abcdef123456'
const REQUEST_ID = 'deadbeef-1234-4abc-8def-deadbeef1234'
const TENANT_ID = '1234abcd-5678-4abc-8def-1234abcd5678'
const OTHER_PROJECT_ID = 'bbbbbbbb-1234-4abc-8def-bbbbbbbbbbbb'

const PROJECT_DOCUMENT: ProjectDocumentRow = {
  id: DOCUMENT_ID,
  projectId: PROJECT_ID,
  fileName: 'site-photo.jpg',
  documentType: 'image',
  mimeType: 'image/jpeg',
  sizeBytes: 42,
  description: null,
  createdAt: '2026-09-12T00:00:00.000Z',
}

const PROJECT_DOCUMENT_RESULT: ProjectDocumentListResult = {
  projectId: PROJECT_ID,
  rows: [PROJECT_DOCUMENT],
  total: 1,
  page: 1,
  limit: 50,
  totalPages: 1,
}

describe('claim document Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'test-access-token' } },
        }),
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('posts normalized attachment commands with the request identity header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          attachmentId: REQUEST_ID,
          tenantId: TENANT_ID,
          projectId: PROJECT_ID,
          claimId: CLAIM_ID,
          documentId: DOCUMENT_ID,
          changed: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      attachClaimDocumentThroughCoreApi(CLAIM_ID.toUpperCase(), {
        clientRequestId: REQUEST_ID.toUpperCase(),
        documentId: DOCUMENT_ID.toUpperCase(),
        kind: 'photo',
        caption: '  Site photo  ',
      }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      data: {
        attachmentId: REQUEST_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        claimId: CLAIM_ID,
        documentId: DOCUMENT_ID,
        changed: false,
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/claims/${CLAIM_ID}/documents`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: REQUEST_ID,
          documentId: DOCUMENT_ID,
          kind: 'photo',
          caption: 'Site photo',
        }),
        headers: expect.objectContaining({
          authorization: 'Bearer test-access-token',
          'content-type': 'application/json',
          'Idempotency-Key': REQUEST_ID,
        }),
      }),
    )
  })

  it('rejects malformed commands before obtaining Core access', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      attachClaimDocumentThroughCoreApi(CLAIM_ID, {
        clientRequestId: 'not-a-uuid',
        documentId: DOCUMENT_ID,
        kind: 'photo',
        caption: null,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Invalid claim document attachment command.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('keeps an uncertain attachment outcome retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network timeout')))

    await expect(
      attachClaimDocumentThroughCoreApi(CLAIM_ID, {
        clientRequestId: REQUEST_ID,
        documentId: DOCUMENT_ID,
        kind: 'certificate',
        caption: null,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. Attachment outcome is unconfirmed; retry with the same request.',
    })
  })

  it('does not describe a Core 5xx as a confirmed non-attachment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'database unavailable' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(
      attachClaimDocumentThroughCoreApi(CLAIM_ID, {
        clientRequestId: REQUEST_ID,
        documentId: DOCUMENT_ID,
        kind: 'photo',
        caption: null,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'ERP Core API returned a server error. Attachment outcome is unconfirmed; retry with the same request.',
    })
  })

  it('reads project documents with honest server pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          projectId: PROJECT_ID,
          rows: [
            {
              id: DOCUMENT_ID,
              projectId: PROJECT_ID,
              fileName: 'site-photo.jpg',
              documentType: 'image',
              mimeType: 'image/jpeg',
              sizeBytes: 42,
              description: null,
              createdAt: '2026-09-12T00:00:00.000Z',
            },
          ],
          total: 101,
          page: 3,
          limit: 25,
          totalPages: 5,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getProjectDocumentsThroughCoreApi(PROJECT_ID, { page: 3, limit: 25 }),
    ).resolves.toMatchObject({ ok: true, data: { total: 101, page: 3, limit: 25 } })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/documents?page=3&limit=25`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
  })

  it.each(['client construction', 'session lookup'])('returns 503 without fetching when %s throws', async (failure) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    if (failure === 'client construction') {
      vi.mocked(createSupabaseServerClient).mockRejectedValueOnce(new Error('client unavailable'))
    } else {
      vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
        auth: { getSession: vi.fn().mockRejectedValueOnce(new Error('session unavailable')) },
      } as never)
    }

    await expect(getProjectDocumentsThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid project and query input before obtaining Core access', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProjectDocumentsThroughCoreApi('not-a-uuid')).resolves.toMatchObject({ ok: false, status: 400 })
    await expect(getProjectDocumentsThroughCoreApi(PROJECT_ID, { page: 0 })).resolves.toMatchObject({ ok: false, status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('normalizes UUID casing for the request and response scope checks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ...PROJECT_DOCUMENT_RESULT,
        projectId: PROJECT_ID.toUpperCase(),
        rows: [{ ...PROJECT_DOCUMENT, projectId: PROJECT_ID.toUpperCase() }],
      }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProjectDocumentsThroughCoreApi(PROJECT_ID.toUpperCase(), { documentType: 'image' })).resolves.toMatchObject({
      ok: true,
      data: { projectId: PROJECT_ID.toUpperCase(), rows: [{ projectId: PROJECT_ID.toUpperCase() }] },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/documents?documentType=image&page=1&limit=50`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it.each([
    ['top-level project scope', { projectId: OTHER_PROJECT_ID }],
    ['row project scope', { rows: [{ ...PROJECT_DOCUMENT, projectId: OTHER_PROJECT_ID }] }],
    ['response page', { page: 2 }],
    ['response limit', { limit: 25 }],
    ['unsafe total', { total: Number.MAX_SAFE_INTEGER + 1 }],
    ['wrong total pages', { totalPages: 2 }],
    ['duplicate document IDs', { rows: [PROJECT_DOCUMENT, { ...PROJECT_DOCUMENT, id: PROJECT_DOCUMENT.id.toUpperCase(), fileName: 'other.jpg' }], total: 2 }],
    ['rows beyond requested limit', { rows: Array.from({ length: 51 }, (_, index) => ({ ...PROJECT_DOCUMENT, id: `abcdef12-3456-4abc-8def-${String(index + 1).padStart(12, '0')}` })), total: 51, totalPages: 2 }],
    ['filtered document type mismatch', { rows: [{ ...PROJECT_DOCUMENT, documentType: 'pdf' }] }],
  ])('rejects %s response binding violations', async (_label, changes) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...PROJECT_DOCUMENT_RESULT, ...changes }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const query = _label === 'filtered document type mismatch' ? { documentType: 'image' } : undefined

    await expect(getProjectDocumentsThroughCoreApi(PROJECT_ID, query)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('allows an empty out-of-range page and a count-drifted page when rows remain bounded', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...PROJECT_DOCUMENT_RESULT, rows: [], total: 101, page: 99, limit: 25, totalPages: 5 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...PROJECT_DOCUMENT_RESULT, total: 101, page: 3, limit: 25, totalPages: 5 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProjectDocumentsThroughCoreApi(PROJECT_ID, { page: 99, limit: 25 })).resolves.toMatchObject({ ok: true, data: { rows: [], page: 99 } })
    await expect(getProjectDocumentsThroughCoreApi(PROJECT_ID, { page: 3, limit: 25 })).resolves.toMatchObject({ ok: true, data: { rows: [PROJECT_DOCUMENT], total: 101 } })
  })
})
