import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

const CORE_API_URL = 'https://core.example.test'

function probe(url = 'https://erp.example/api/health', headers?: HeadersInit) {
  return GET(new Request(url, { headers }))
}

describe('web health endpoint', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('ERP_CORE_API_URL', CORE_API_URL)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('keeps the release-identity contract on an anonymous probe while reporting the outage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      })
    )

    const response = await probe()
    const body = await response.json()

    // Liveness stays 200 so a Core API outage does not get the web tier
    // recycled. `ok`, `service` and `revision` are asserted by the promotion
    // pipeline (.github/workflows/deploy-production.yml) and by
    // scripts/verify-production-surface.mjs, so they must stay unconditional
    // on an anonymous probe; the outage is reported through `status` and
    // `dependencies` instead of by falsifying `ok`.
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.status).toBe('degraded')
    expect(body.service).toBe('abi-ops-web')
    expect(typeof body.revision).toBe('string')
    expect(body.revision.length).toBeGreaterThan(0)
    expect(body.dependencies.coreApi.state).toBe('unreachable')
    expect(body.dependencies.coreApi.detail).toBeUndefined()
  })

  it('answers 503 for dependency-gated monitoring when the Core API is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 }))
    )

    const response = await probe('https://erp.example/api/health?deep=1')
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.dependencies.coreApi.state).toBe('unhealthy')
    expect(body.dependencies.coreApi.status).toBe(503)
  })

  it('returns the raw transport error only to a caller holding the health token', async () => {
    vi.stubEnv('HEALTH_DETAIL_TOKEN', 'health-token-value')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      })
    )

    const anonymous = await (await probe()).json()
    expect(anonymous.dependencies.coreApi.state).toBe('unreachable')
    expect(anonymous.dependencies.coreApi.detail).toBeUndefined()

    const authorised = await (
      await probe('https://erp.example/api/health', {
        authorization: 'Bearer health-token-value',
      })
    ).json()

    expect(authorised.dependencies.coreApi.detail).toBe('TypeError: fetch failed')
  })

  it('flags a missing Core API configuration instead of hanging', async () => {
    vi.stubEnv('ERP_CORE_API_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const body = await (await probe()).json()

    expect(body.dependencies.coreApi.state).toBe('not_configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
