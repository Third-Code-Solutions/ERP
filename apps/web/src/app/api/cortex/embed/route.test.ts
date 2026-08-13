import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getUnembeddedCortexNodes: vi.fn(),
  setCortexNodeEmbedding: vi.fn(),
  embedBatch: vi.fn(),
  cortexEmbeddingText: vi.fn(),
  canonicalRole: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  getUnembeddedCortexNodes: mocks.getUnembeddedCortexNodes,
  setCortexNodeEmbedding: mocks.setCortexNodeEmbedding,
  cortexEmbeddingText: mocks.cortexEmbeddingText,
}))

vi.mock('@third-code-erp/ai', () => ({
  embedBatch: mocks.embedBatch,
}))

vi.mock('@/lib/operations/nav-config', () => ({
  canonicalRole: mocks.canonicalRole,
}))

import { POST } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

function request() {
  return POST(new NextRequest('http://localhost/api/cortex/embed', { method: 'POST' }))
}

function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  )
  expect(response.headers.get('vary')).toBe('Cookie')
}

describe('Cortex embedding response privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'admin',
      user: { id: '22222222-2222-4222-8222-222222222222' },
    })
    mocks.canonicalRole.mockReturnValue('admin')
    mocks.getUnembeddedCortexNodes.mockResolvedValue([])
    vi.stubEnv('ERP_CORTEX_LEGACY_EMBED_ENABLED', 'true')
    vi.stubEnv('ERP_CORTEX_LEGACY_EMBED_TENANT_IDS', TENANT_ID)
  })

  afterEach(() => vi.unstubAllEnvs())

  it('defaults the legacy provider-spending route closed', async () => {
    vi.stubEnv('ERP_CORTEX_LEGACY_EMBED_ENABLED', 'false')
    const response = await request()
    expect(response.status).toBe(410)
    expectPrivate(response)
    expect(mocks.getUnembeddedCortexNodes).not.toHaveBeenCalled()
    expect(mocks.embedBatch).not.toHaveBeenCalled()
  })

  it('keeps an authorized empty-batch response private', async () => {
    const response = await request()

    expect(response.status).toBe(200)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({ embedded: 0, remaining: 0 })
  })

  it('keeps unauthenticated and forbidden responses private', async () => {
    mocks.getUserProfile.mockResolvedValueOnce(null)
    const unauthenticated = await request()
    expect(unauthenticated.status).toBe(401)
    expectPrivate(unauthenticated)

    mocks.getUserProfile.mockResolvedValueOnce({
      tenantId: TENANT_ID,
      role: 'sales',
      user: { id: '22222222-2222-4222-8222-222222222222' },
    })
    mocks.canonicalRole.mockReturnValueOnce('sales')
    const forbidden = await request()
    expect(forbidden.status).toBe(403)
    expectPrivate(forbidden)
    expect(mocks.getUnembeddedCortexNodes).not.toHaveBeenCalled()
  })
})
