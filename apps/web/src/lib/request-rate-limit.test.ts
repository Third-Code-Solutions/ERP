import { describe, expect, it } from 'vitest'

import {
  consumeRequestRateLimit,
  requestRateLimitKey,
  requestRateLimitPolicy,
  storeLocalRequestRateLimitEntry,
} from './request-rate-limit'

describe('request rate-limit identity', () => {
  it('keeps anonymous and authenticated traffic in separate buckets', () => {
    const ip = '203.0.113.10'

    expect(requestRateLimitKey(ip, null)).toBe(`ip:${ip}`)
    expect(requestRateLimitKey(ip, 'user-one')).toBe('user:user-one')
    expect(requestRateLimitKey(ip, null)).not.toBe(
      requestRateLimitKey(ip, 'user-one')
    )
  })

  it('isolates authenticated users behind the same shared IP', () => {
    const ip = '203.0.113.10'

    expect(requestRateLimitKey(ip, 'user-one')).not.toBe(
      requestRateLimitKey(ip, 'user-two')
    )
  })

  it('keeps provider-backed chat bursts below general authenticated traffic', () => {
    expect(requestRateLimitPolicy('/api/cortex/chat', true)).toEqual({
      bucket: 'provider-chat',
      limit: 20,
      windowMs: 60_000,
    })
    expect(
      requestRateLimitPolicy(
        '/api/cortex/chat/jobs/22222222-2222-4222-8222-222222222222',
        true
      )
    ).toEqual({
      bucket: 'provider-chat',
      limit: 20,
      windowMs: 60_000,
    })
    expect(requestRateLimitPolicy('/api/search', true)).toEqual({
      bucket: 'general',
      limit: 1_000,
      windowMs: 60_000,
    })
  })

  it('limits embedding bursts more tightly, including anonymous traffic', () => {
    expect(requestRateLimitPolicy('/api/cortex/embed', true)).toMatchObject({
      bucket: 'provider-embedding',
      limit: 6,
    })
    expect(requestRateLimitPolicy('/api/cortex/embed', false)).toMatchObject({
      bucket: 'provider-embedding',
      limit: 2,
    })
    expect(requestRateLimitPolicy('/api/ai/similar-items', true)).toMatchObject({
      bucket: 'provider-embedding',
      limit: 6,
    })
  })

  it('uses a separate bounded burst for local document intake', () => {
    expect(requestRateLimitPolicy('/api/upload/complete', true)).toEqual({
      bucket: 'document-intake',
      limit: 10,
      windowMs: 60_000,
    })
    expect(requestRateLimitPolicy('/api/upload/complete', false)).toEqual({
      bucket: 'document-intake',
      limit: 2,
      windowMs: 60_000,
    })
  })

  it('rejects only after policy limit and resets after window expiry', () => {
    const policy = requestRateLimitPolicy('/api/cortex/chat', true)
    let entry: { count: number; windowStart: number } | undefined

    for (let attempt = 0; attempt < policy.limit; attempt += 1) {
      const result = consumeRequestRateLimit(entry, policy, 10_000)
      expect(result.limited).toBe(false)
      entry = result.entry
    }

    const blocked = consumeRequestRateLimit(entry, policy, 10_000)
    expect(blocked.limited).toBe(true)

    const afterWindow = consumeRequestRateLimit(
      blocked.entry,
      policy,
      10_000 + policy.windowMs + 1
    )
    expect(afterWindow).toEqual({
      entry: { count: 1, windowStart: 10_000 + policy.windowMs + 1 },
      limited: false,
    })
  })

  it('bounds the compatibility limiter map when new identities keep arriving', () => {
    const entries = new Map<string, { count: number; windowStart: number }>()
    storeLocalRequestRateLimitEntry(entries, 'first', { count: 1, windowStart: 1 }, 2)
    storeLocalRequestRateLimitEntry(entries, 'second', { count: 1, windowStart: 2 }, 2)
    storeLocalRequestRateLimitEntry(entries, 'third', { count: 1, windowStart: 3 }, 2)

    expect([...entries.keys()]).toEqual(['second', 'third'])
  })
})
