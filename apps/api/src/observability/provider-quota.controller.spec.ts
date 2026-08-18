import { describe, expect, it, vi } from 'vitest'
import type { Response } from 'express'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { ProviderQuotaController } from './provider-quota.controller'
import type { ProviderQuotaService } from './provider-quota.service'

const PRINCIPAL: ErpPrincipal = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'viewer',
  email: 'viewer@example.test',
}

function responseHarness() {
  return {
    status: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>
    setHeader: ReturnType<typeof vi.fn>
  }
}

describe('ProviderQuotaController', () => {
  it('uses authenticated principal scope and returns allowed decisions', async () => {
    const quota = {
      consume: vi.fn().mockResolvedValue({
        allowed: true,
        bucket: 'provider-chat',
        count: 1,
        limit: 20,
        retryAfterSeconds: 0,
        scope: 'tenant-user',
      }),
    } as unknown as ProviderQuotaService
    const controller = new ProviderQuotaController(quota)
    const response = responseHarness()

    await expect(
      controller.consume({ bucket: 'provider-chat' }, PRINCIPAL, response)
    ).resolves.toMatchObject({ allowed: true })
    expect(quota.consume).toHaveBeenCalledWith('provider-chat', PRINCIPAL)
    expect(response.status).not.toHaveBeenCalled()
  })

  it('accepts the dedicated visual-extraction bucket', async () => {
    const quota = {
      consume: vi.fn().mockResolvedValue({
        allowed: true,
        bucket: 'provider-vision',
        count: 1,
        limit: 4,
        retryAfterSeconds: 0,
        scope: 'tenant-user',
      }),
    } as unknown as ProviderQuotaService
    const controller = new ProviderQuotaController(quota)

    await expect(
      controller.consume(
        { bucket: 'provider-vision' },
        PRINCIPAL,
        responseHarness()
      )
    ).resolves.toMatchObject({ bucket: 'provider-vision', limit: 4 })
    expect(quota.consume).toHaveBeenCalledWith('provider-vision', PRINCIPAL)
  })

  it('marks blocked decisions with standard rate-limit headers', async () => {
    const quota = {
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        bucket: 'provider-embedding',
        count: 7,
        limit: 6,
        retryAfterSeconds: 17,
        scope: 'tenant-user',
      }),
    } as unknown as ProviderQuotaService
    const controller = new ProviderQuotaController(quota)
    const response = responseHarness()

    await controller.consume(
      { bucket: 'provider-embedding' },
      PRINCIPAL,
      response
    )
    expect(response.status).toHaveBeenCalledWith(429)
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '17')
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '6')
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Scope',
      'tenant-user'
    )
  })

  it('rejects unknown buckets before Redis work', async () => {
    const quota = { consume: vi.fn() } as unknown as ProviderQuotaService
    const controller = new ProviderQuotaController(quota)
    await expect(
      controller.consume(
        { bucket: 'provider-unknown' },
        PRINCIPAL,
        responseHarness()
      )
    ).rejects.toThrow('Invalid provider quota bucket')
    expect(quota.consume).not.toHaveBeenCalled()
  })
})
