export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as {
    code?: unknown
    message?: unknown
  }
  if (candidate.code === 'refresh_token_not_found') return true

  return (
    typeof candidate.message === 'string' &&
    /invalid refresh token|refresh token not found/i.test(candidate.message)
  )
}

export function isSupabaseAuthCookieName(name: string): boolean {
  return /^sb-.+-auth-token(?:\.\d+)?$/.test(name)
}
