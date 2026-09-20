import { describe, expect, it } from 'vitest'
import { parseClaimAmount } from './claim-amount'

describe('claim amount input', () => {
  it.each([
    ['0.01', 1], ['1.01', 101], ['1.15', 115], [' 1250000.50 ', 125000050],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('preserves exact peso input %s', (raw, expected) => {
    const form = new FormData()
    form.set('amount_php', raw)
    expect(parseClaimAmount(form)).toBe(expected)
  })

  it.each(['1.001', '1x', '1e2', '1,000.00', '-1', '0', 'NaN', 'Infinity', '90071992547409.92', '9'.repeat(129)])('rejects malformed or unsafe pesos %s', raw => {
    const form = new FormData()
    form.set('amount_php', raw)
    form.set('amount_cents', '100')
    expect(parseClaimAmount(form)).toBeUndefined()
  })

  it.each([['115', 115], ['9007199254740991', Number.MAX_SAFE_INTEGER]])('preserves direct integer cents %s', (raw, expected) => {
    const form = new FormData()
    form.set('amount_cents', raw)
    expect(parseClaimAmount(form)).toBe(expected)
  })

  it.each(['100junk', '100.1', '1e2', '0', '-1', '', '9007199254740992'])('rejects malformed or unsafe cents %s', raw => {
    const form = new FormData()
    form.set('amount_cents', raw)
    expect(parseClaimAmount(form)).toBeUndefined()
  })

  it('requires an amount and rejects duplicate amount fields', () => {
    const form = new FormData()
    expect(parseClaimAmount(form)).toBeUndefined()
    form.append('amount_php', '1.00')
    form.append('amount_php', '2.00')
    expect(parseClaimAmount(form)).toBeUndefined()
  })
})
