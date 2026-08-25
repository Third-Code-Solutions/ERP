import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  getProject: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  writeAuditLog: vi.fn(),
  documentDeleteWritesUseCoreApi: vi.fn(),
  documentUploadReservationIssuanceUsesCoreApi: vi.fn(),
  documentUploadReservationWritesUseCoreApi: vi.fn(),
  publicSigningWritesUseCoreApi: vi.fn(),
  reserveDocumentUploadThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  AuthError: class AuthError extends Error {},
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
  },
}))

vi.mock('@/lib/project-queries', () => ({
  getProject: mocks.getProject,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/erp-core-client', () => ({
  documentDeleteWritesUseCoreApi: mocks.documentDeleteWritesUseCoreApi,
  documentUploadReservationIssuanceUsesCoreApi:
    mocks.documentUploadReservationIssuanceUsesCoreApi,
  documentUploadReservationWritesUseCoreApi:
    mocks.documentUploadReservationWritesUseCoreApi,
  publicSigningWritesUseCoreApi: mocks.publicSigningWritesUseCoreApi,
  reserveDocumentUploadThroughCoreApi:
    mocks.reserveDocumentUploadThroughCoreApi,
}))

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TRACE_ID = '77777777-7777-4777-8777-777777777777'

describe('signed document upload Project access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'pm',
      email: 'pm@example.com',
      fullName: 'PM User',
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue([{ total: '0' }])
    mocks.getProject.mockResolvedValue(null)
    mocks.storageFrom.mockReturnValue({
      createSignedUploadUrl: mocks.createSignedUploadUrl,
    })
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: mocks.storageFrom },
    })
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.documentDeleteWritesUseCoreApi.mockReturnValue(true)
    mocks.documentUploadReservationIssuanceUsesCoreApi.mockReturnValue(false)
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(false)
    mocks.publicSigningWritesUseCoreApi.mockReturnValue(true)
  })

  it('rejects unauthenticated and tenantless callers before authority work', async () => {
    const requestBody = JSON.stringify({
      projectId: OTHER_PROJECT_ID,
      fileName: 'drawing.dwg',
      mimeType: 'application/acad',
      sizeBytes: 1_024,
    })
    mocks.getUserProfile.mockResolvedValueOnce(null)
    const unauthenticated = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      })
    )
    expect(unauthenticated.status).toBe(401)

    mocks.getUserProfile.mockResolvedValueOnce({
      user: { id: USER_ID },
      tenantId: null,
      role: 'pm',
    })
    const tenantless = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      })
    )
    expect(tenantless.status).toBe(403)

    expect(mocks.reserveDocumentUploadThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.getProject).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a role without document mutation capability before request work', async () => {
    mocks.can.mockReturnValue(false)
    const request = new NextRequest('http://localhost/api/upload/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: OTHER_PROJECT_ID,
        fileName: 'drawing.dwg',
        mimeType: 'application/acad',
        sizeBytes: 1_024,
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.can).toHaveBeenCalledWith('pm', 'document.manage')
    expect(mocks.getProject).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('rejects unknown authority-shaped request fields at the Web boundary', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
          tenantId: TENANT_ID,
        }),
      })
    )

    expect(response.status).toBe(400)
    expect(mocks.getProject).not.toHaveBeenCalled()
    expect(mocks.reserveDocumentUploadThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('rejects an absent or cross-tenant Project before quota and Storage work', async () => {
    const request = new NextRequest('http://localhost/api/upload/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: OTHER_PROJECT_ID,
        fileName: 'drawing.dwg',
        mimeType: 'application/acad',
        sizeBytes: 1_024,
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Project not found',
    })
    expect(mocks.getProject).toHaveBeenCalledWith(
      TENANT_ID,
      OTHER_PROJECT_ID
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('preserves signed-upload behavior for a same-tenant Project', async () => {
    mocks.where
      .mockResolvedValueOnce([{ tenant_id: TENANT_ID }])
      .mockResolvedValueOnce([{ total: '0' }])
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.test/upload',
        token: 'signed-token',
        path: `${TENANT_ID}/${OTHER_PROJECT_ID}/object-drawing.dwg`,
      },
      error: null,
    })
    const request = new NextRequest('http://localhost/api/upload/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: OTHER_PROJECT_ID,
        fileName: 'drawing.dwg',
        mimeType: 'application/acad',
        sizeBytes: 1_024,
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      signedUrl: 'https://storage.example.test/upload',
      token: 'signed-token',
      originalFileName: 'drawing.dwg',
    })
    expect(mocks.getProject).toHaveBeenCalledWith(
      TENANT_ID,
      OTHER_PROJECT_ID
    )
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: USER_ID,
      entityType: 'document_upload',
      entityId: OTHER_PROJECT_ID,
      action: 'query',
      diff: { operation: 'signed_upload_url_created' },
    })
  })

  it('uses Core issuance for an exact selected tenant without legacy authority', async () => {
    const reservationId = '44444444-4444-4444-8444-444444444444'
    mocks.documentUploadReservationIssuanceUsesCoreApi.mockReturnValue(true)
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    mocks.reserveDocumentUploadThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        reservationId,
        projectId: OTHER_PROJECT_ID,
        storagePath: `${TENANT_ID}/${OTHER_PROJECT_ID}/${reservationId}-drawing.dwg`,
        originalFileName: 'drawing.dwg',
        declaredSizeBytes: 1_024,
        declaredContentType: 'application/acad',
        expiresAt: '2026-08-24T02:00:00.000Z',
        signedUrl: 'https://storage.example.test/upload',
        token: 'signed-token',
        state: 'active',
        replayed: false,
      },
    })
    const response = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'stable-file-attempt-1',
          'x-request-id': TRACE_ID,
        },
        body: JSON.stringify({
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      signedUrl: 'https://storage.example.test/upload',
      token: 'signed-token',
      storagePath: `${TENANT_ID}/${OTHER_PROJECT_ID}/${reservationId}-drawing.dwg`,
      originalFileName: 'drawing.dwg',
      reservationId,
    })
    expect(mocks.reserveDocumentUploadThroughCoreApi).toHaveBeenCalledWith(
      {
        projectId: OTHER_PROJECT_ID,
        fileName: 'drawing.dwg',
        mimeType: 'application/acad',
        sizeBytes: 1_024,
      },
      'stable-file-attempt-1',
      TRACE_ID
    )
    expect(mocks.publicSigningWritesUseCoreApi).toHaveBeenCalledWith(TENANT_ID)
    expect(mocks.documentDeleteWritesUseCoreApi).toHaveBeenCalledWith(TENANT_ID)
    expect(mocks.getProject).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('rejects a same-project Core path substituted from another reservation', async () => {
    const reservationId = '44444444-4444-4444-8444-444444444444'
    const substitutedId = '55555555-5555-4555-8555-555555555555'
    mocks.documentUploadReservationIssuanceUsesCoreApi.mockReturnValue(true)
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    mocks.reserveDocumentUploadThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        reservationId,
        projectId: OTHER_PROJECT_ID,
        storagePath: `${TENANT_ID}/${OTHER_PROJECT_ID}/${substitutedId}-drawing.dwg`,
        originalFileName: 'drawing.dwg',
        declaredSizeBytes: 1_024,
        declaredContentType: 'application/acad',
        expiresAt: '2026-08-24T02:00:00.000Z',
        signedUrl: 'https://storage.example.test/upload',
        token: 'signed-token',
        state: 'active',
        replayed: false,
      },
    })

    const response = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'stable-file-attempt-substituted',
        },
        body: JSON.stringify({
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(503)
  })

  it('fails closed when selected issuance lacks lifecycle or idempotency authority', async () => {
    mocks.documentUploadReservationIssuanceUsesCoreApi.mockReturnValue(true)
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(false)
    const requestBody = JSON.stringify({
      projectId: OTHER_PROJECT_ID,
      fileName: 'drawing.dwg',
      mimeType: 'application/acad',
      sizeBytes: 1_024,
    })

    const partial = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      })
    )
    expect(partial.status).toBe(503)

    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    const missingKey = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      })
    )
    expect(missingKey.status).toBe(400)
    expect(mocks.reserveDocumentUploadThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it.each([
    {
      missingAuthority: 'public signing',
      configure: () => mocks.publicSigningWritesUseCoreApi.mockReturnValue(false),
    },
    {
      missingAuthority: 'document deletion',
      configure: () => mocks.documentDeleteWritesUseCoreApi.mockReturnValue(false),
    },
  ])(
    'fails closed before signing when selected issuance lacks $missingAuthority Core authority',
    async ({ configure }) => {
      mocks.documentUploadReservationIssuanceUsesCoreApi.mockReturnValue(true)
      mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
      configure()

      const response = await POST(
        new NextRequest('http://localhost/api/upload/sign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'stable-file-attempt-readiness',
          },
          body: JSON.stringify({
            projectId: OTHER_PROJECT_ID,
            fileName: 'drawing.dwg',
            mimeType: 'application/acad',
            sizeBytes: 1_024,
          }),
        })
      )

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        error: 'Upload reservation issuance is not fully configured.',
      })
      expect(mocks.publicSigningWritesUseCoreApi).toHaveBeenCalledWith(TENANT_ID)
      expect(mocks.documentDeleteWritesUseCoreApi).toHaveBeenCalledWith(TENANT_ID)
      expect(mocks.reserveDocumentUploadThroughCoreApi).not.toHaveBeenCalled()
      expect(mocks.getProject).not.toHaveBeenCalled()
      expect(mocks.select).not.toHaveBeenCalled()
      expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
      expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    }
  )

  it('does not fall back to legacy signing after a selected Core failure', async () => {
    mocks.documentUploadReservationIssuanceUsesCoreApi.mockReturnValue(true)
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    mocks.reserveDocumentUploadThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable.',
    })

    const response = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'stable-file-attempt-2',
        },
        body: JSON.stringify({
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(503)
    expect(mocks.getProject).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('does not return a signed URL when its audit entry cannot be appended', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.where
      .mockResolvedValueOnce([{ tenant_id: TENANT_ID, role: 'pm' }])
      .mockResolvedValueOnce([{ total: '0' }])
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.test/upload',
        token: 'signed-token',
        path: `${TENANT_ID}/${OTHER_PROJECT_ID}/object-drawing.dwg`,
      },
      error: null,
    })
    mocks.writeAuditLog.mockRejectedValue(new Error('audit unavailable'))

    const response = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to audit upload authorization',
    })
    expect(errorSpy).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })

  it('does not expose Storage provider details when signing fails', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.where
      .mockResolvedValueOnce([{ tenant_id: TENANT_ID }])
      .mockResolvedValueOnce([{ total: '0' }])
    mocks.getProject.mockResolvedValue({ id: OTHER_PROJECT_ID, tenant_id: TENANT_ID })
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: null,
      error: new Error('secret storage endpoint and bucket internals'),
    })

    const response = await POST(
      new NextRequest('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to create signed upload URL.',
    })
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0]?.[1]).toEqual(
      new Error('secret storage endpoint and bucket internals')
    )
    errorSpy.mockRestore()
  })
})
