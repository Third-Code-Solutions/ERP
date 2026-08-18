import { describe, expect, it } from 'vitest'
import { databaseErrorCode, databaseErrorMessage } from './database-error'

describe('database error unwrapping', () => {
  it('includes a driver constraint message hidden by a Drizzle cause', () => {
    const driverError = Object.assign(
      new Error('Only an unposted draft cash transaction can be posted'),
      { code: '23514' },
    )
    const drizzleError = Object.assign(new Error('Failed query'), {
      cause: driverError,
    })

    expect(databaseErrorMessage(drizzleError)).toContain(
      'Only an unposted draft cash transaction can be posted',
    )
    expect(databaseErrorCode(drizzleError)).toBe('23514')
  })

  it('terminates safely for a circular cause chain', () => {
    const error = new Error('loop') as Error & { cause?: unknown }
    error.cause = error

    expect(databaseErrorMessage(error)).toBe('loop')
    expect(databaseErrorCode(error)).toBeUndefined()
  })
})
