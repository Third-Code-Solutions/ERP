export function requestRateLimitKey(
  ip: string,
  userId: string | null | undefined
): string {
  return userId ? `user:${userId}` : `ip:${ip}`
}

export type RequestRateLimitBucket =
  | 'general'
  | 'provider-chat'
  | 'provider-embedding'
  | 'provider-vision'

export interface RequestRateLimitPolicy {
  bucket: RequestRateLimitBucket
  limit: number
  windowMs: number
}

export interface RequestRateLimitEntry {
  count: number
  windowStart: number
}

const WINDOW_MS = 60_000
export const MAX_LOCAL_REQUEST_RATE_LIMIT_ENTRIES = 10_000

/**
 * The local limiter is only a compatibility guard, but it still must not let
 * untrusted request identities grow an Edge isolate without bound. Eviction is
 * deliberately oldest-first: distributed mode is the global enforcement path.
 */
export function storeLocalRequestRateLimitEntry(
  entries: Map<string, RequestRateLimitEntry>,
  key: string,
  entry: RequestRateLimitEntry,
  maximumEntries = MAX_LOCAL_REQUEST_RATE_LIMIT_ENTRIES
): void {
  if (!entries.has(key) && entries.size >= maximumEntries) {
    const oldestKey = entries.keys().next().value
    if (oldestKey !== undefined) entries.delete(oldestKey)
  }
  entries.set(key, entry)
}

/**
 * Keep provider-backed routes below general request volume. The policy is
 * shared by the local compatibility limiter and the optional distributed Edge
 * limiter; provider spend accounting remains a separate Core concern.
 */
export function requestRateLimitPolicy(
  pathname: string,
  authenticated: boolean
): RequestRateLimitPolicy {
  const limit = authenticated ? 1_000 : 100

  if (
    pathname === '/api/cortex/chat' ||
    pathname.startsWith('/api/cortex/chat/jobs/') ||
    pathname === '/api/ai/chat'
  ) {
    return {
      bucket: 'provider-chat',
      limit: authenticated ? 20 : 10,
      windowMs: WINDOW_MS,
    }
  }

  if (
    pathname === '/api/cortex/embed' ||
    pathname === '/api/ai/similar-items'
  ) {
    return {
      bucket: 'provider-embedding',
      limit: authenticated ? 6 : 2,
      windowMs: WINDOW_MS,
    }
  }

  // Upload completion can invoke the server-side visual document extractor.
  // Keep its external-model burst below both general and text-chat traffic.
  if (pathname === '/api/upload/complete') {
    return {
      bucket: 'provider-vision',
      limit: authenticated ? 4 : 2,
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
