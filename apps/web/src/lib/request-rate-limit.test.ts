import { describe, expect, it } from 'vitest'

import {
  requestRateLimitKey,
  shouldRateLimitRequest,
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
})

describe('request rate-limit eligibility', () => {
  it('does not consume the shared bucket for page navigation', () => {
    expect(shouldRateLimitRequest('/', 'GET')).toBe(false)
    expect(shouldRateLimitRequest('/tasks', 'GET')).toBe(false)
    expect(shouldRateLimitRequest('/projects', 'HEAD')).toBe(false)
  })

  it('limits API, auth, and mutating requests', () => {
    expect(shouldRateLimitRequest('/api/notifications', 'GET')).toBe(true)
    expect(shouldRateLimitRequest('/auth/login', 'GET')).toBe(true)
    expect(shouldRateLimitRequest('/projects', 'POST')).toBe(true)
    expect(shouldRateLimitRequest('/projects', 'DELETE')).toBe(true)
  })
})
