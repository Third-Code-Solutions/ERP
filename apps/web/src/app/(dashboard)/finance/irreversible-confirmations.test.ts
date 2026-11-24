import { describe, expect, it } from 'vitest'
import { IRREVERSIBLE_CONFIRMATIONS } from './irreversible-confirmations'

describe('IRREVERSIBLE_CONFIRMATIONS', () => {
  it.each(Object.entries(IRREVERSIBLE_CONFIRMATIONS))(
    '%s says the action cannot be undone',
    (_name, message) => {
      expect(message).toContain('cannot be undone')
    }
  )

  it('covers the eight irreversible finance actions', () => {
    expect(Object.keys(IRREVERSIBLE_CONFIRMATIONS)).toHaveLength(8)
  })
})
