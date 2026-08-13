import { describe, expect, it } from 'vitest'
import { AuthError } from '@third-code-erp/auth'
import { safeActionError } from './safe-action-error'

describe('safeActionError', () => {
  it('maps provider and database details to bounded copy', () => {
    expect(
      safeActionError(
        new Error('duplicate key value violates unique constraint users_email_key'),
        'Could not save user.'
      )
    ).toBe('A record with these values already exists.')

    expect(
      safeActionError(
        new Error('insert or update violates foreign key constraint users_tenant_id_fkey'),
        'Could not save user.'
      )
    ).toBe('Cannot complete because related records exist.')
  })

  it('preserves typed authorization copy and uses fallback for unknown errors', () => {
    expect(
      safeActionError(
        new AuthError('FORBIDDEN', 'Forbidden: role "viewer" lacks admin.users'),
        'Could not save user.'
      )
    ).toBe('Forbidden: role "viewer" lacks admin.users')
    expect(safeActionError(new Error('secret provider payload'), 'Could not save user.')).toBe(
      'Could not save user.'
    )
    expect(safeActionError('not an error', 'Could not save user.')).toBe(
      'Could not save user.'
    )
  })
})
