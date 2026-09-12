import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInspectionPhotoThroughCoreApi } from './erp-core-client'

const createSupabaseServerClientMock = vi.hoisted(() => vi.fn())

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

const command = {
  opportunityId: '33333333-3333-4333-8333-333333333333',
  storagePath:
    '22222222-2222-4222-8222-222222222222/opportunities/33333333-3333-4333-8333-333333333333/inspection/photo.jpg',
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg' as const,
  sizeBytes: 1,
  caption: 'Front elevation',
}

const result = {
  documentId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  opportunityId: command.opportunityId,
  projectId: null,
  storagePath: command.storagePath,
  fileName: command.fileName,
  status: 'created' as const,
}

const unknownOutcome = {
  ok: false as const,
  error:
    'ERP Core API is unavailable. Inspection photo outcome is unconfirmed; retry the same request.',
  status: 503,
}

const serverErrorOutcome = {
  ok: false as const,
  error:
    'ERP Core API returned a server error. Inspection photo outcome is unconfirmed; retry the same request.',
  status: 503,
}

const uncertainStatusOutcome = {
  ok: false as const,
  error:
    'ERP Core API returned an unconfirmed inspection photo outcome. Retry the same request.',
  status: 408,
}

describe('createInspectionPhotoThroughCoreApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: { access_token: 'test-token' },
          },
        }),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('binds a successful receipt to the exact requested opportunity and storage identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(createInspectionPhotoThroughCoreApi(command)).resolves.toEqual({
      ok: true,
      data: result,
      status: 201,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/opportunities/${command.opportunityId}/inspection-photos`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
      })
    )
  })

  it.each([
    [
      'opportunity',
      {
        ...result,
        opportunityId: '44444444-4444-4444-8444-444444444444',
      },
    ],
    [
      'storage path',
      {
        ...result,
        storagePath:
          '22222222-2222-4222-8222-222222222222/opportunities/33333333-3333-4333-8333-333333333333/inspection/other.jpg',
      },
    ],
    [
      'file name',
      {
        ...result,
        fileName: 'other.jpg',
      },
    ],
    [
      'tenant',
      {
        ...result,
        tenantId: '44444444-4444-4444-8444-444444444444',
      },
    ],
  ])('rejects a foreign or mismatched %s receipt', async (_field, receipt) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(receipt), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      )
    )

    await expect(createInspectionPhotoThroughCoreApi(command)).resolves.toEqual({
      ok: false,
      error:
        'ERP Core API returned a mismatched inspection photo result. Outcome is unconfirmed; retry the same request.',
      status: 502,
    })
  })

  it('rejects a malformed success receipt before exposing it as committed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...result, documentId: 'not-a-uuid' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      )
    )

    await expect(createInspectionPhotoThroughCoreApi(command)).resolves.toEqual({
      ok: false,
      error:
        'ERP Core API returned an invalid inspection photo result. Outcome is unconfirmed; retry the same request.',
      status: 502,
    })
  })

  it('rejects a storage path without a tenant UUID before Core access', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createInspectionPhotoThroughCoreApi({
        ...command,
        storagePath: 'opportunities/33333333-3333-4333-8333-333333333333/inspection/photo.jpg',
      })
    ).resolves.toEqual({
      ok: false,
      error: 'Inspection photo metadata is invalid.',
      status: 400,
    })
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('contains a thrown session access failure as an unconfirmed outcome', async () => {
    createSupabaseServerClientMock.mockRejectedValueOnce(
      new Error('session service unavailable')
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createInspectionPhotoThroughCoreApi(command)).resolves.toEqual(
      unknownOutcome
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('contains a thrown Core request as an unconfirmed outcome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection reset'))
    )

    await expect(createInspectionPhotoThroughCoreApi(command)).resolves.toEqual(
      unknownOutcome
    )
  })

  it('uses uncertainty wording for an unclassified Core failure status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('service unavailable', { status: 503 }))
    )

    await expect(createInspectionPhotoThroughCoreApi(command)).resolves.toEqual(
      serverErrorOutcome
    )
  })

  it('does not treat a timeout response as a known rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'metadata was not recorded' }), {
          status: 408,
          headers: { 'content-type': 'application/json' },
        })
      )
    )

    await expect(createInspectionPhotoThroughCoreApi(command)).resolves.toEqual(
      uncertainStatusOutcome
    )
  })
})
