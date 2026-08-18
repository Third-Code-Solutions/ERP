import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Redis from 'ioredis'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import {
  providerQuotaKey,
  providerQuotaPolicy,
  ProviderQuotaService,
} from './provider-quota.service'

const PRINCIPAL: Pick<ErpPrincipal, 'tenantId' | 'userId'> = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  userId: '11111111-1111-4111-8111-111111111111',
}

describe('ProviderQuotaService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps fixed provider policies bounded', () => {
    expect(providerQuotaPolicy('provider-chat')).toEqual({
      bucket: 'provider-chat',
      limit: 20,
      windowMs: 60_000,
    })
    expect(providerQuotaPolicy('provider-embedding')).toEqual({
      bucket: 'provider-embedding',
      limit: 6,
      windowMs: 60_000,
    })
    expect(providerQuotaPolicy('provider-vision')).toEqual({
      bucket: 'provider-vision',
      limit: 4,
      windowMs: 60_000,
    })
  })

  it('hashes tenant/user identity into a non-reversible Redis key', () => {
    const key = providerQuotaKey(
      'provider-chat',
      PRINCIPAL.tenantId,
      PRINCIPAL.userId
    )
    expect(key).toMatch(/^third-code-erp:provider-quota:v1:provider-chat:[0-9a-f]{64}$/)
    expect(key).not.toContain(PRINCIPAL.tenantId)
    expect(key).not.toContain(PRINCIPAL.userId)
  })

  it('allows through-limit requests and blocks later requests', async () => {
    const evalRedis = vi
      .fn()
      .mockResolvedValueOnce([20, 25_000])
      .mockResolvedValueOnce([21, 24_000])
    const service = new ProviderQuotaService(
      { eval: evalRedis } as unknown as Redis
    )

    await expect(
      service.consume('provider-chat', PRINCIPAL)
    ).resolves.toMatchObject({
      allowed: true,
      count: 20,
      limit: 20,
      retryAfterSeconds: 0,
      scope: 'tenant-user',
    })
    await expect(
      service.consume('provider-chat', PRINCIPAL)
    ).resolves.toMatchObject({
      allowed: false,
      count: 21,
      limit: 20,
      retryAfterSeconds: 24,
    })
    expect(evalRedis).toHaveBeenCalledWith(
      expect.any(String),
      1,
      providerQuotaKey('provider-chat', PRINCIPAL.tenantId, PRINCIPAL.userId),
      '60000',
      '20'
    )
    expect(evalRedis.mock.calls[0]?.[0]).toContain(
      'tonumber(ARGV[2]) + 1'
    )
  })

  it('fails closed when Redis accounting fails', async () => {
    const evalRedis = vi.fn().mockRejectedValue(new Error('redis down'))
    const service = new ProviderQuotaService(
      { eval: evalRedis } as unknown as Redis
    )

    await expect(
      service.consume('provider-embedding', PRINCIPAL)
    ).rejects.toThrow('Provider quota accounting is unavailable')
  })
})
