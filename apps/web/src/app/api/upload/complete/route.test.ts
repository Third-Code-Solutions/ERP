import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  getProject: vi.fn(),
  parseAndStoreCad: vi.fn(),
  extractScopeFromVisual: vi.fn(),
  send: vi.fn(),
  transaction: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/project-queries', () => ({
  getProject: mocks.getProject,
}))

vi.mock('@/lib/cad/parse-and-store', () => ({
  parseAndStoreCad: mocks.parseAndStoreCad,
}))

vi.mock('@/lib/vision/extract-from-visual', () => ({
  extractScopeFromVisual: mocks.extractScopeFromVisual,
}))

vi.mock('@/lib/inngest', () => ({
  inngest: {
    send: mocks.send,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('completed document upload Project access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: USER_ID })
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue([{ tenant_id: TENANT_ID, role: 'pm' }])
    mocks.getProject.mockResolvedValue(null)
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({ returning: mocks.returning })
    mocks.transaction.mockImplementation(
      async (callback: (tx: { insert: typeof mocks.insert }) => unknown) =>
        callback({ insert: mocks.insert })
    )
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  it('rejects a role without document mutation capability before request work', async () => {
    mocks.can.mockReturnValue(false)
    const request = new NextRequest(
      'http://localhost/api/upload/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath:
            `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-drawing.dwg`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.can).toHaveBeenCalledWith('pm', 'document.manage')
    expect(mocks.getProject).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('rejects an absent or cross-tenant Project before recording or processing', async () => {
    const request = new NextRequest(
      'http://localhost/api/upload/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath:
            `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-drawing.dwg`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'drawing.dwg',
          mimeType: 'application/acad',
          sizeBytes: 1_024,
        }),
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Project not found',
    })
    expect(mocks.getProject).toHaveBeenCalledWith(
      TENANT_ID,
      OTHER_PROJECT_ID
    )
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('preserves document recording for a same-tenant Project', async () => {
    const documentId = '44444444-4444-4444-8444-444444444444'
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.returning.mockResolvedValue([{ id: documentId }])
    const storagePath =
      `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-notes.txt`
    const request = new NextRequest(
      'http://localhost/api/upload/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath,
          projectId: OTHER_PROJECT_ID,
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 1_024,
        }),
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: documentId,
      storagePath,
      documentType: 'other',
      cadParseQueued: false,
    })
    expect(mocks.insert).toHaveBeenCalledOnce()
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ insert: mocks.insert }),
      {
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityType: 'document',
        entityId: documentId,
        action: 'create',
        diff: {
          project_id: OTHER_PROJECT_ID,
          document_type: 'other',
          size_bytes: 1_024,
        },
      }
    )
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
  })

  it('fails closed before extraction when document audit cannot commit', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.getProject.mockResolvedValue({
      id: OTHER_PROJECT_ID,
      tenant_id: TENANT_ID,
    })
    mocks.returning.mockResolvedValue([
      { id: '44444444-4444-4444-8444-444444444444' },
    ])
    mocks.writeAuditLogInTransaction.mockRejectedValue(
      new Error('audit unavailable')
    )

    const response = await POST(
      new NextRequest('http://localhost/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath:
            `${TENANT_ID}/${OTHER_PROJECT_ID}/uploaded-notes.txt`,
          projectId: OTHER_PROJECT_ID,
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          sizeBytes: 1_024,
        }),
      })
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to record document',
    })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })
})
