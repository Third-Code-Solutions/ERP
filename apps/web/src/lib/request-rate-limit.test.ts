import { describe, expect, it } from 'vitest'

import { requestRateLimitKey } from './request-rate-limit'

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
})
