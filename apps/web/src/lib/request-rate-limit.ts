export function requestRateLimitKey(
  ip: string,
  userId: string | null | undefined
): string {
  return userId ? `user:${userId}` : `ip:${ip}`
}
