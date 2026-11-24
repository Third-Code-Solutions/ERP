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

  it.each([
    ['23505', 'A record with these values already exists.'],
    ['23503', 'Cannot complete because related records exist.'],
    ['23514', 'Could not save rate card.'],
  ])('maps a Drizzle-wrapped SQLSTATE %s by its cause code', (code, expected) => {
    const wrapped = new Error('Failed query: insert into "rate_cards" ("name") values ($1)\nparams: Cement', {
      cause: Object.assign(new Error('database rule text'), { code }),
    })

    expect(safeActionError(wrapped, 'Could not save rate card.')).toBe(expected)
  })

  it('never lets the SQL text or its parameters steer or leak into the copy', () => {
    const wrapped = new Error(
      'Failed query: insert into "rate_cards" ("name") values ($1)\nparams: this name already exists, foreign key',
      { cause: Object.assign(new Error('value too long for type character varying(80)'), { code: '22001' }) }
    )

    const copy = safeActionError(wrapped, 'Could not save rate card.')

    expect(copy).toBe('Could not save rate card.')
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
