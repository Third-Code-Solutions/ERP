export function requestRateLimitKey(
  ip: string,
  userId: string | null | undefined
): string {
  return userId ? `user:${userId}` : `ip:${ip}`
}

export interface RequestRateLimitPolicy {
  bucket: 'general' | 'provider-chat' | 'provider-embedding'
  limit: number
  windowMs: number
}

export interface RequestRateLimitEntry {
  count: number
  windowStart: number
}

const WINDOW_MS = 60_000

/**
 * Keep expensive provider-backed endpoints on smaller per-instance bursts.
 * This is a spend-safety guard, not a global quota: Redis-backed accounting
 * remains a backend migration concern.
 */
export function requestRateLimitPolicy(
  pathname: string,
  authenticated: boolean
): RequestRateLimitPolicy {
  const limit = authenticated ? 1_000 : 100

  if (
    pathname === '/api/cortex/chat' ||
    pathname === '/api/ai/chat' ||
    pathname === '/api/ai/similar-items'
  ) {
    return {
      bucket: 'provider-chat',
      limit: authenticated ? 20 : 10,
      windowMs: WINDOW_MS,
    }
  }

  if (pathname === '/api/cortex/embed') {
    return {
      bucket: 'provider-embedding',
      limit: authenticated ? 6 : 2,
      windowMs: WINDOW_MS,
    }
  }

  return { bucket: 'general', limit, windowMs: WINDOW_MS }
}

export function consumeRequestRateLimit(
  entry: RequestRateLimitEntry | undefined,
  policy: RequestRateLimitPolicy,
  now = Date.now()
): { entry: RequestRateLimitEntry; limited: boolean } {
  if (!entry || now - entry.windowStart > policy.windowMs) {
    return {
      entry: { count: 1, windowStart: now },
      limited: false,
    }
  }

  const nextEntry = { ...entry, count: entry.count + 1 }
  return { entry: nextEntry, limited: nextEntry.count > policy.limit }
}
