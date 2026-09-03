import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  execute: vi.fn(),
  embedText: vi.fn(),
  isEmbeddingProviderConfigured: vi.fn(),
  serializeEmbedding: vi.fn(),
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
  db: { execute: mocks.execute },
}))

vi.mock('@third-code-erp/ai', () => ({
  embedText: mocks.embedText,
  isEmbeddingProviderConfigured: mocks.isEmbeddingProviderConfigured,
  serializeEmbedding: mocks.serializeEmbedding,
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
const USER_ID = '22222222-2222-4222-8222-222222222222'

function request(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/ai/similar-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

function profile(role: 'commercial' | 'viewer' = 'commercial') {
  return {
    user: { id: USER_ID },
    tenantId: TENANT_ID,
    role,
    email: 'operator@example.test',
    fullName: 'Operator',
  }
}

describe('BOM similar-item retrieval boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
    mocks.isEmbeddingProviderConfigured.mockReturnValue(true)
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.embedText.mockResolvedValue([0.1, 0.2])
    mocks.serializeEmbedding.mockReturnValue('[0.1,0.2]')
    mocks.consumeProviderQuota.mockResolvedValue({ ok: true, skipped: true })
    mocks.execute.mockResolvedValue([
      {
        chunk_text: 'Copper pipe | Unit: m | Unit cost: 125.50 PHP | Markup: 30%',
        score: '0.91',
      },
      {
        chunk_text: 'Weak match | Unit: pc | Unit cost: 1.00 PHP | Markup: 10%',
        score: '0.20',
      },
    ])
    mocks.writeAuditLog.mockResolvedValue(undefined)
  })

  it('requires an authenticated profile and stays private', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await request({ description: 'Copper pipe' })

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
    expect(mocks.embedText).not.toHaveBeenCalled()
  })

  it('denies Viewer assistant spend before any provider or retrieval side effect', async () => {
    mocks.getUserProfile.mockResolvedValue(profile('viewer'))

    const response = await request({ description: 'Copper pipe' })

    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    )
    expect(response.headers.get('vary')).toBe('Cookie')
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.isEmbeddingProviderConfigured).not.toHaveBeenCalled()
    expect(mocks.consumeProviderQuota).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.embedText).not.toHaveBeenCalled()
    expect(mocks.serializeEmbedding).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('fails closed before quota or provider work when the required audit fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.writeAuditLog.mockRejectedValueOnce(
      new Error('sensitive audit storage detail')
    )

    const response = await request({ description: 'Copper pipe' })

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    )
    expect(response.headers.get('vary')).toBe('Cookie')
    const body = await response.json()
    expect(body).toEqual({
      items: [],
      reason: 'AI suggestions unavailable',
    })
    expect(JSON.stringify(body)).not.toContain('sensitive audit storage detail')
    expect(errorSpy).toHaveBeenCalledWith(
      '[ai/similar-items] audit log failed'
    )
    expect(errorSpy.mock.calls.flat().map(String).join(' ')).not.toContain(
      'sensitive audit storage detail'
    )
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1)
    expect(mocks.isEmbeddingProviderConfigured).not.toHaveBeenCalled()
    expect(mocks.consumeProviderQuota).not.toHaveBeenCalled()
    expect(mocks.embedText).not.toHaveBeenCalled()
    expect(mocks.serializeEmbedding).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('bounds malformed and untrusted payloads before provider work', async () => {
    const invalidJson = await POST(
      new NextRequest('http://localhost/api/ai/similar-items', {
        method: 'POST',
        body: '{',
      })
    )
    const tooShort = await request({ description: 'pipe' })
    const tooLong = await request({ description: 'x'.repeat(301) })

    expect(invalidJson.status).toBe(400)
    expect(tooShort.status).toBe(400)
    expect(tooLong.status).toBe(400)
    expect(mocks.embedText).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('preserves empty-form behavior and skips provider work when unconfigured', async () => {
    await expect((await request({ description: '   ' })).json()).resolves.toEqual({ items: [] })

    delete process.env.OPENAI_API_KEY
    mocks.isEmbeddingProviderConfigured.mockReturnValue(false)
    const response = await request({ description: 'Copper pipe' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      items: [],
      reason: 'AI not configured',
    })
    expect(mocks.embedText).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        diff: expect.objectContaining({ failure: 'provider_not_configured' }),
      })
    )
  })

  it('allows a Commercial operator to retrieve tenant-scoped suggestions with audit evidence', async () => {
    const response = await request({ description: '  Copper pipe  ' })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items).toEqual([
      {
        description: 'Copper pipe',
        unit_cost_cents: 12550,
        markup_bps: 3000,
        unit: 'm',
        score: 91,
        source: 'approved_bom_history',
      },
    ])
    expect(mocks.embedText).toHaveBeenCalledWith('Copper pipe')
    expect(mocks.consumeProviderQuota).toHaveBeenCalledWith(
      'provider-embedding',
      TENANT_ID
    )
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(2)
    expect(mocks.writeAuditLog).toHaveBeenNthCalledWith(1, {
      tenantId: TENANT_ID,
      actorId: USER_ID,
      entityType: 'ai_similar_items',
      entityId: USER_ID,
      action: 'query',
      diff: { query: 'Copper pipe', phase: 'request' },
    })
    expect(mocks.writeAuditLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityType: 'ai_similar_items',
        action: 'query',
        diff: expect.objectContaining({
          query: 'Copper pipe',
          phase: 'result',
          result_count: 1,
        }),
      })
    )
    expect(
      mocks.writeAuditLog.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.consumeProviderQuota.mock.invocationCallOrder[0] ?? 0)
    expect(
      mocks.writeAuditLog.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.embedText.mock.invocationCallOrder[0] ?? 0)
    expect(
      mocks.writeAuditLog.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.execute.mock.invocationCallOrder[0] ?? 0)
  })

  it('fails closed when embedding or retrieval is unavailable', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.embedText.mockRejectedValue(new Error('provider down'))

    const response = await request({ description: 'Copper pipe' })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      items: [],
      reason: 'AI suggestions unavailable',
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        diff: expect.objectContaining({ failure: 'retrieval_unavailable' }),
      })
    )
    expect(errorSpy).toHaveBeenCalledWith(
      '[ai/similar-items] retrieval failed'
    )
    expect(errorSpy.mock.calls.flat().map(String).join(' ')).not.toContain(
      'provider down'
    )
  })
})
