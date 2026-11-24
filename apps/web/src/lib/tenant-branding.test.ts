import { describe, expect, it } from 'vitest'
import { NEUTRAL_COMPANY_NAME, tenantDisplayName } from './tenant-branding'

describe('tenantDisplayName', () => {
  it('returns the tenant company name', () => {
    expect(tenantDisplayName('Northwind Builders Corp.')).toBe('Northwind Builders Corp.')
  })

  it('collapses stray whitespace and line breaks', () => {
    expect(tenantDisplayName('  Northwind \n Builders  ')).toBe('Northwind Builders')
  })

  it.each([null, undefined, '', '   '])(
    'falls back to a neutral name for %j, never to another company',
    (missing) => {
      expect(tenantDisplayName(missing)).toBe(NEUTRAL_COMPANY_NAME)
      expect(NEUTRAL_COMPANY_NAME).not.toMatch(/actuate|abi/i)
    }
  )
})
