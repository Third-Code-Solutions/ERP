const AUTH_CALLBACK_PATHS = new Set(['/dashboard', '/auth/update-password'])

export function resolveAuthCallbackPath(next: string | null): string {
  if (!next) return '/dashboard'
  return AUTH_CALLBACK_PATHS.has(next) ? next : '/dashboard'
}
