import { AuthError } from '@third-code-erp/auth'
import { errorChainSqlState } from './error-chain-message'

/**
 * Convert untrusted provider/database failures into bounded user-facing copy.
 * Full error objects stay in server logs; raw SQL/provider details never cross
 * a Server Action boundary.
 *
 * A Drizzle failure reads "Failed query: <sql>" on top, so the database
 * outcome is taken from the SQLSTATE on its cause, never from the SQL text
 * or its parameters.
 */
export function safeActionError(error: unknown, fallback: string): string {
  if (error instanceof AuthError) return error.message

  const raw = error instanceof Error ? error.message.trim() : ''
  // The query wrapper's text holds user-supplied parameters; it must not steer the copy.
  const message = raw.startsWith('Failed query:') ? '' : raw
  const sqlState = errorChainSqlState(error)
  if (message.startsWith('Forbidden:')) return message
  if (sqlState === '23505' || /duplicate key|unique constraint|already exists/i.test(message)) {
    return 'A record with these values already exists.'
  }
  if (sqlState === '23503' || /foreign key|violates .*constraint/i.test(message)) {
    return 'Cannot complete because related records exist.'
  }

  return fallback
}
