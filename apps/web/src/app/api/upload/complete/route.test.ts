import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
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
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
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

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('completed document upload Project access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: USER_ID })
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue([{ tenant_id: TENANT_ID }])
    mocks.getProject.mockResolvedValue(null)
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({ returning: mocks.returning })
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
    expect(mocks.parseAndStoreCad).not.toHaveBeenCalled()
    expect(mocks.extractScopeFromVisual).not.toHaveBeenCalled()
  })
})
