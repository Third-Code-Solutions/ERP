import { AuthError } from '@third-code-erp/auth'

/**
 * Convert untrusted provider/database failures into bounded user-facing copy.
 * Full error objects stay in server logs; raw SQL/provider details never cross
 * a Server Action boundary.
 */
const PERMISSION_DENIED = 'Your role does not have permission to do this.'

export function safeActionError(error: unknown, fallback: string): string {
  if (error instanceof AuthError) return error.code === 'FORBIDDEN' ? PERMISSION_DENIED : error.message

  const message = error instanceof Error ? error.message.trim() : ''
  if (message.startsWith('Forbidden:')) return PERMISSION_DENIED
  if (/duplicate key|unique constraint|already exists/i.test(message)) {
    return 'A record with these values already exists.'
  }
  if (/foreign key|violates .*constraint/i.test(message)) {
    return 'Cannot complete because related records exist.'
  }

  return fallback
}
