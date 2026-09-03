import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getUnembeddedCortexNodes: vi.fn(),
  setCortexNodeEmbedding: vi.fn(),
  embedBatch: vi.fn(),
  cortexEmbeddingText: vi.fn(),
  writeAuditLog: vi.fn(),
  consumeProviderQuota: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability } = await import(
    '@third-code-erp/shared-types/authorization'
  )
  return {
    can: roleHasCapability,
    getUserProfile: mocks.getUserProfile,
  }
})

vi.mock('@third-code-erp/database', () => ({
  getUnembeddedCortexNodes: mocks.getUnembeddedCortexNodes,
  setCortexNodeEmbedding: mocks.setCortexNodeEmbedding,
  cortexEmbeddingText: mocks.cortexEmbeddingText,
}))

vi.mock('@third-code-erp/ai', () => ({
  embedBatch: mocks.embedBatch,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/provider-quota', () => ({
  consumeProviderQuota: mocks.consumeProviderQuota,
  providerQuotaBlockedResponse: vi.fn(),
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
    mocks.getUnembeddedCortexNodes.mockResolvedValue([])
    mocks.setCortexNodeEmbedding.mockResolvedValue(undefined)
    mocks.embedBatch.mockResolvedValue([[0.1, 0.2]])
    mocks.cortexEmbeddingText.mockReturnValue('bounded node text')
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.consumeProviderQuota.mockResolvedValue({ ok: true, skipped: true })
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

  it('keeps unauthenticated, Viewer, and non-admin responses private', async () => {
    mocks.getUserProfile.mockResolvedValueOnce(null)
    const unauthenticated = await request()
    expect(unauthenticated.status).toBe(401)
    expectPrivate(unauthenticated)

    mocks.getUserProfile.mockResolvedValueOnce({
      tenantId: TENANT_ID,
      role: 'viewer',
      user: { id: '22222222-2222-4222-8222-222222222222' },
    })
    const viewer = await request()
    expect(viewer.status).toBe(403)
    expectPrivate(viewer)

    mocks.getUserProfile.mockResolvedValueOnce({
      tenantId: TENANT_ID,
      role: 'sales',
      user: { id: '33333333-3333-4333-8333-333333333333' },
    })
    const nonAdmin = await request()
    expect(nonAdmin.status).toBe(403)
    expectPrivate(nonAdmin)
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.getUnembeddedCortexNodes).not.toHaveBeenCalled()
  })

  it('fails closed on audit failure before quota, provider, or database work', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.writeAuditLog.mockRejectedValueOnce(
      new Error('sensitive audit storage detail')
    )

    const response = await request()

    expect(response.status).toBe(503)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      error: 'Semantic indexing is temporarily unavailable.',
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: '22222222-2222-4222-8222-222222222222',
      entityType: 'cortex_embedding',
      entityId: TENANT_ID,
      action: 'update',
      diff: {
        phase: 'request',
        input_category: 'tenant_cortex_nodes',
        batch_size: 64,
      },
    })
    expect(errorSpy).toHaveBeenCalledWith('[cortex/embed] audit log failed')
    expect(errorSpy.mock.calls.flat().map(String).join(' ')).not.toContain(
      'sensitive audit storage detail'
    )
    expect(mocks.getUnembeddedCortexNodes).not.toHaveBeenCalled()
    expect(mocks.consumeProviderQuota).not.toHaveBeenCalled()
    expect(mocks.cortexEmbeddingText).not.toHaveBeenCalled()
    expect(mocks.embedBatch).not.toHaveBeenCalled()
    expect(mocks.setCortexNodeEmbedding).not.toHaveBeenCalled()
  })

  it('allows an Owner and audits before retrieval, quota, provider, and writes', async () => {
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'owner',
      user: { id: 'owner-a' },
    })
    mocks.getUnembeddedCortexNodes.mockResolvedValue([
      { id: 'node-a', title: 'Private project evidence' },
    ])

    const response = await request()

    expect(response.status).toBe(200)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({ embedded: 1, remaining: 0 })
    expect(mocks.writeAuditLog).toHaveBeenNthCalledWith(1, {
      tenantId: TENANT_ID,
      actorId: 'owner-a',
      entityType: 'cortex_embedding',
      entityId: TENANT_ID,
      action: 'update',
      diff: {
        phase: 'request',
        input_category: 'tenant_cortex_nodes',
        batch_size: 64,
      },
    })
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain(
      'Private project evidence'
    )
    const auditOrder = mocks.writeAuditLog.mock.invocationCallOrder[0] ?? 0
    expect(auditOrder).toBeLessThan(
      mocks.getUnembeddedCortexNodes.mock.invocationCallOrder[0] ?? 0
    )
    expect(auditOrder).toBeLessThan(
      mocks.consumeProviderQuota.mock.invocationCallOrder[0] ?? 0
    )
    expect(auditOrder).toBeLessThan(
      mocks.embedBatch.mock.invocationCallOrder[0] ?? 0
    )
    expect(auditOrder).toBeLessThan(
      mocks.setCortexNodeEmbedding.mock.invocationCallOrder[0] ?? 0
    )
  })
})
