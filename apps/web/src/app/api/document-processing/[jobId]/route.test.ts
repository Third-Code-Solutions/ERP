import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getDocumentProcessingStatusThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
}))

vi.mock('@/lib/erp-core-client', () => ({
  getDocumentProcessingStatusThroughCoreApi:
    mocks.getDocumentProcessingStatusThroughCoreApi,
}))

import { GET } from './route'

const JOB_ID = '99999999-9999-4999-8999-999999999999'

describe('document processing status proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires an authenticated user', async () => {
    mocks.getUser.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ jobId: JOB_ID }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(
      mocks.getDocumentProcessingStatusThroughCoreApi
    ).not.toHaveBeenCalled()
  })

  it('returns only the validated tenant-scoped core status', async () => {
    mocks.getUser.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' })
    const status = {
      jobId: JOB_ID,
      documentId: '88888888-8888-4888-8888-888888888888',
      status: 'processing',
      attempts: 1,
      scopeItemsCreated: 0,
      draftBomId: null,
      warnings: [],
      failureCode: null,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:01:00.000Z',
    }
    mocks.getDocumentProcessingStatusThroughCoreApi.mockResolvedValue({
      ok: true,
      data: status,
    })

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ jobId: JOB_ID }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(status)
    expect(
      mocks.getDocumentProcessingStatusThroughCoreApi
    ).toHaveBeenCalledWith(JOB_ID)
  })

  it('does not expose a core error as a successful status', async () => {
    mocks.getUser.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' })
    mocks.getDocumentProcessingStatusThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Document processing status is unavailable.',
    })

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ jobId: JOB_ID }),
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'Document processing status is unavailable.',
    })
  })
})
