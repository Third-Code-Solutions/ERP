import { describe, expect, it } from 'vitest'

import {
  consumeDistributedRateLimit,
  distributedRateLimitConfiguration,
  distributedRateLimitKey,
  type DistributedRateLimitFetcher,
} from './distributed-request-rate-limit'
import type { RequestRateLimitPolicy } from './request-rate-limit'

const configuration = {
  mode: 'configured' as const,
  endpoint: 'https://example-rate-limit.upstash.io',
  token: 'test-token',
  keySalt: 'unit-test-salt-not-a-secret-00000000',
}

const embeddingPolicy: RequestRateLimitPolicy = {
  bucket: 'provider-embedding',
  limit: 6,
  windowMs: 60_000,
}

describe('distributed request rate-limit configuration', () => {
  it('stays process-local until the exact enable flag is selected', () => {
    expect(
      distributedRateLimitConfiguration({
        UPSTASH_REDIS_REST_URL: configuration.endpoint,
        UPSTASH_REDIS_REST_TOKEN: configuration.token,
        ERP_RATE_LIMIT_KEY_SALT: configuration.keySalt,
      })
    ).toEqual({ mode: 'disabled' })
  })

  it('fails closed when distributed enforcement is selected but incomplete', () => {
    expect(
      distributedRateLimitConfiguration({
        ERP_DISTRIBUTED_RATE_LIMIT_ENABLED: 'true',
        UPSTASH_REDIS_REST_URL: configuration.endpoint,
        UPSTASH_REDIS_REST_TOKEN: configuration.token,
      })
    ).toEqual({ mode: 'invalid', reason: 'missing-key-salt' })

    expect(
      distributedRateLimitConfiguration({
        ERP_DISTRIBUTED_RATE_LIMIT_ENABLED: 'true',
        UPSTASH_REDIS_REST_URL: 'http://not-tls.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: configuration.token,
        ERP_RATE_LIMIT_KEY_SALT: configuration.keySalt,
      })
    ).toEqual({ mode: 'invalid', reason: 'invalid-url' })
  })

  it('accepts only a TLS Upstash root endpoint and keeps credentials server-only', () => {
    expect(
      distributedRateLimitConfiguration({
        ERP_DISTRIBUTED_RATE_LIMIT_ENABLED: 'true',
        UPSTASH_REDIS_REST_URL: `${configuration.endpoint}/`,
        UPSTASH_REDIS_REST_TOKEN: configuration.token,
        ERP_RATE_LIMIT_KEY_SALT: configuration.keySalt,
      })
    ).toEqual(configuration)
  })
})

describe('distributed request rate-limit consumption', () => {
  it('hashes the subject before it reaches the external Redis key', async () => {
    const first = await distributedRateLimitKey(
      configuration,
      'user:11111111-1111-4111-8111-111111111111',
      embeddingPolicy
    )
    const second = await distributedRateLimitKey(
      configuration,
      'user:22222222-2222-4222-8222-222222222222',
      embeddingPolicy
    )

    expect(first).toMatch(
      /^third-code-erp:edge-rate-limit:v1:provider-embedding:[a-f0-9]{64}$/
    )
    expect(first).not.toContain('11111111-1111-4111-8111-111111111111')
    expect(first).not.toContain(configuration.keySalt)
    expect(first).not.toBe(second)
  })

  it('sends one atomic REST EVAL command and returns the provider decision', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetcher: DistributedRateLimitFetcher = async (input, init) => {
      calls.push({ input, init })
      return new Response(JSON.stringify({ result: [7, 15_001] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const decision = await consumeDistributedRateLimit(
      configuration,
      'user:11111111-1111-4111-8111-111111111111',
      embeddingPolicy,
      fetcher
    )

    expect(decision).toEqual({
      outcome: 'limited',
      count: 7,
      limit: 6,
      retryAfterSeconds: 16,
    })
    expect(calls).toHaveLength(1)
    const request = calls[0]
    expect(String(request?.input)).toBe(configuration.endpoint)
    expect(request?.init?.method).toBe('POST')
    expect(request?.init?.redirect).toBe('error')
    expect(request?.init?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    })

    const body = JSON.parse(String(request?.init?.body)) as unknown[]
    expect(body[0]).toBe('EVAL')
    expect(body[2]).toBe(1)
    expect(body[3]).toMatch(
      /^third-code-erp:edge-rate-limit:v1:provider-embedding:[a-f0-9]{64}$/
    )
    expect(JSON.stringify(body)).not.toContain('11111111-1111-4111-8111-111111111111')
  })

  it('returns unavailable instead of allowing traffic on a rejected or malformed response', async () => {
    const rejected: DistributedRateLimitFetcher = async () =>
      new Response('unavailable', { status: 503 })
    const malformed: DistributedRateLimitFetcher = async () =>
      new Response(JSON.stringify({ result: [1, -1] }), { status: 200 })

    await expect(
      consumeDistributedRateLimit(
        configuration,
        'user:11111111-1111-4111-8111-111111111111',
        embeddingPolicy,
        rejected
      )
    ).resolves.toEqual({ outcome: 'unavailable', reason: 'request-failed' })
    await expect(
      consumeDistributedRateLimit(
        configuration,
        'user:11111111-1111-4111-8111-111111111111',
        embeddingPolicy,
        malformed
      )
    ).resolves.toEqual({ outcome: 'unavailable', reason: 'invalid-response' })
  })
})
