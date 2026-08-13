export function requestRateLimitKey(
  ip: string,
  userId: string | null | undefined
): string {
  return userId ? `user:${userId}` : `ip:${ip}`
}

/**
 * Keep navigation cheap while retaining a limiter on API and auth surfaces.
 * A rendered page can fan out into several server requests and is already
 * protected by the route/auth boundary; counting every GET made the shared
 * Edge bucket reject legitimate sequential navigation as HTTP 429.
 */
export function shouldRateLimitRequest(pathname: string, method: string): boolean {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`
  const normalizedMethod = method.toUpperCase()

  if (
    normalizedPathname.startsWith('/api/') ||
    normalizedPathname === '/api' ||
    normalizedPathname.startsWith('/auth')
  ) {
    return true
  }

  return normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD'
}
