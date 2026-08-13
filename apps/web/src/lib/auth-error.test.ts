import { describe, expect, it } from 'vitest'
import { AuthError } from '@third-code-erp/auth'

describe('AuthError', () => {
  it('preserves stable authorization code and user-safe message', () => {
    const error = new AuthError(
      'FORBIDDEN',
      'Forbidden: role "viewer" lacks capability "finance.post"'
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AuthError')
    expect(error.code).toBe('FORBIDDEN')
    expect(error.message).toBe(
      'Forbidden: role "viewer" lacks capability "finance.post"'
    )
  })
})
