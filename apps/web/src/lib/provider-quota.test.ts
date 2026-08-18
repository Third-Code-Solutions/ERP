import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseServerClient } from '@third-code-erp/auth'
import {
  consumeProviderQuota,
  providerQuotaBlockedResponse,
} from './provider-quota'

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('shared provider quota client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.stubEnv('ERP_PROVIDER_QUOTA_VIA_API', '')
    vi.stubEnv('ERP_PROVIDER_QUOTA_VIA_API_TENANT_IDS', '')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'test-access-token' } },
        }),
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('keeps shared accounting disabled unless exact tenant gate matches', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      consumeProviderQuota('provider-chat', TENANT_ID)
    ).resolves.toEqual({ ok: true, skipped: true })
    expect(fetchMock).not.toHaveBeenCalled()

    vi.stubEnv('ERP_PROVIDER_QUOTA_VIA_API', 'true')
    vi.stubEnv(
      'ERP_PROVIDER_QUOTA_VIA_API_TENANT_IDS',
      '33333333-3333-4333-8333-333333333333'
    )
    expect(
      (await consumeProviderQuota('provider-chat', TENANT_ID)).ok
    ).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards only bucket and bearer auth to Nest quota endpoint', async () => {
    vi.stubEnv('ERP_PROVIDER_QUOTA_VIA_API', 'true')
    vi.stubEnv('ERP_PROVIDER_QUOTA_VIA_API_TENANT_IDS', TENANT_ID)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: true,
          bucket: 'provider-chat',
          count: 1,
          limit: 20,
          retryAfterSeconds: 0,
          scope: 'tenant-user',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      consumeProviderQuota('provider-chat', TENANT_ID)
    ).resolves.toMatchObject({ ok: true, skipped: false })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/provider-quotas/consume',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ bucket: 'provider-chat' }),
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer test-access-token',
          'content-type': 'application/json',
        }),
      })
    )
  })

  it('accepts the bounded visual-extraction quota decision', async () => {
    vi.stubEnv('ERP_PROVIDER_QUOTA_VIA_API', 'true')
    vi.stubEnv('ERP_PROVIDER_QUOTA_VIA_API_TENANT_IDS', TENANT_ID)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: true,
          bucket: 'provider-vision',
          count: 1,
          limit: 4,
          retryAfterSeconds: 0,
          scope: 'tenant-user',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      consumeProviderQuota('provider-vision', TENANT_ID)
    ).resolves.toMatchObject({
      ok: true,
      skipped: false,
      data: { bucket: 'provider-vision', limit: 4 },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://erp-api.example.test/v1/provider-quotas/consume',
      expect.objectContaining({
        body: JSON.stringify({ bucket: 'provider-vision' }),
      })
    )
  })

  it('fails closed and exposes bounded retry metadata on a blocked decision', async () => {
    vi.stubEnv('ERP_PROVIDER_QUOTA_VIA_API', 'true')
    vi.stubEnv('ERP_PROVIDER_QUOTA_VIA_API_TENANT_IDS', TENANT_ID)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: false,
            bucket: 'provider-chat',
            count: 21,
            limit: 20,
            retryAfterSeconds: 12,
            scope: 'tenant-user',
          }),
          {
            status: 429,
            headers: {
              'content-type': 'application/json',
              'retry-after': '12',
              'x-ratelimit-limit': '20',
              'x-ratelimit-scope': 'tenant-user',
            },
          }
        )
      )
    )

    const result = await consumeProviderQuota(
      'provider-chat',
      TENANT_ID
    )
    expect(result).toMatchObject({
      ok: false,
      status: 429,
      retryAfterSeconds: 12,
      limit: 20,
      scope: 'tenant-user',
    })
    if (result.ok) throw new Error('expected blocked result')
    const response = providerQuotaBlockedResponse(result)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('12')
    expect(response.headers.get('X-RateLimit-Limit')).toBe('20')
    expect(response.headers.get('X-RateLimit-Scope')).toBe('tenant-user')
  })
})
