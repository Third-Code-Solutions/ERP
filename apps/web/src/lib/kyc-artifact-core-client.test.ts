import { createSupabaseServerClient } from '@third-code-erp/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createKycArtifactThroughCoreApi,
  getAccountKycDocumentsThroughCoreApi,
} from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const ACCOUNT_ID = 'abcdefab-1234-4abc-8def-abcdefabcdef'
const DOCUMENT_ID = 'abcdef12-3456-4abc-8def-abcdef123456'
const REQUEST_ID = 'deadbeef-1234-4abc-8def-deadbeef1234'
const TENANT_ID = '1234abcd-5678-4abc-8def-1234abcd5678'

function documentRow(documentId = DOCUMENT_ID) {
  return {
    documentId,
    tenantId: TENANT_ID,
    accountId: ACCOUNT_ID,
    fileName: 'site-photo.jpg',
    documentType: 'image',
    mimeType: 'image/jpeg',
    createdAt: '2026-09-12T00:00:00.000Z',
    projectId: null,
    projectName: null,
    opportunityId: null,
    opportunityStage: null,
    opportunityType: null,
  }
}

describe('KYC artifact Core client', () => {
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

  it('reads account documents with normalized scope, search, pagination and selected resolution', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accountId: ACCOUNT_ID,
          tenantId: TENANT_ID,
          rows: [documentRow()],
          selectedDocument: documentRow(),
          page: 3,
          limit: 20,
          total: 41,
          totalPages: 3,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getAccountKycDocumentsThroughCoreApi(ACCOUNT_ID.toUpperCase(), {
        q: '  site photo  ',
        page: 3,
        limit: 20,
        selectedDocumentId: DOCUMENT_ID.toUpperCase(),
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { accountId: ACCOUNT_ID, page: 3, total: 41 },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/crm/accounts/${ACCOUNT_ID}/kyc-document-options?q=site+photo&page=3&limit=20&selectedDocumentId=${DOCUMENT_ID}`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer test-access-token',
        }),
      }),
    )
  })

  it('rejects malformed document queries before Core access', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getAccountKycDocumentsThroughCoreApi(ACCOUNT_ID, {
        page: 0,
        limit: 51,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Invalid KYC document filters.',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('posts normalized metadata-only commands with the request identity header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          artifactId: REQUEST_ID,
          accountId: ACCOUNT_ID,
          tenantId: TENANT_ID,
          documentId: null,
          changed: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createKycArtifactThroughCoreApi(ACCOUNT_ID.toUpperCase(), {
        clientRequestId: REQUEST_ID.toUpperCase(),
        artifactType: 'other',
        documentId: null,
        notes: '  Metadata-only evidence  ',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { artifactId: REQUEST_ID, documentId: null, changed: true },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/crm/accounts/${ACCOUNT_ID}/kyc-artifacts`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: REQUEST_ID,
          artifactType: 'other',
          documentId: null,
          notes: 'Metadata-only evidence',
        }),
        headers: expect.objectContaining({
          authorization: 'Bearer test-access-token',
          'content-type': 'application/json',
          'Idempotency-Key': REQUEST_ID,
        }),
      }),
    )
  })

  it('keeps transport failures explicitly retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network timeout')))

    await expect(
      createKycArtifactThroughCoreApi(ACCOUNT_ID, {
        clientRequestId: REQUEST_ID,
        artifactType: 'other',
        documentId: DOCUMENT_ID,
        notes: null,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 503,
      error:
        'ERP Core API is unavailable. KYC artifact outcome is unconfirmed; retry with the same request.',
    })
  })

  it('does not describe a Core 5xx as a confirmed non-creation', async () => {
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
      createKycArtifactThroughCoreApi(ACCOUNT_ID, {
        clientRequestId: REQUEST_ID,
        artifactType: 'other',
        documentId: null,
        notes: null,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 500,
      error:
        'ERP Core API returned a server error. KYC artifact outcome is unconfirmed; retry with the same request.',
    })
  })
})
