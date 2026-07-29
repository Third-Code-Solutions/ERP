import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  getProject: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUploadUrl: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
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

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('signed document upload Project access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: USER_ID })
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue([{ tenant_id: TENANT_ID }])
    mocks.getProject.mockResolvedValue(null)
    mocks.storageFrom.mockReturnValue({
      createSignedUploadUrl: mocks.createSignedUploadUrl,
    })
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: mocks.storageFrom },
    })
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
    expect(mocks.select).toHaveBeenCalledOnce()
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
  })
})
