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

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT_ID = '33333333-3333-4333-8333-333333333333'

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
