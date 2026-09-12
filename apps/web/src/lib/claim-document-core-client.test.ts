import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  attachClaimDocumentThroughCoreApi,
  getProjectDocumentsThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const PROJECT_ID = 'abcdefab-1234-4abc-8def-abcdefabcdef'
const CLAIM_ID = 'fedcba98-7654-4fed-8cba-fedcba987654'
const DOCUMENT_ID = 'abcdef12-3456-4abc-8def-abcdef123456'
const REQUEST_ID = 'deadbeef-1234-4abc-8def-deadbeef1234'
const TENANT_ID = '1234abcd-5678-4abc-8def-1234abcd5678'

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
})
