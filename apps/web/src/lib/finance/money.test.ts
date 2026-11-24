import { describe, expect, it } from 'vitest'
import { centavosToPesos, toCents } from './money'

describe('centavosToPesos', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [100, '1.00'],
    [12_345, '123.45'],
    [-5, '-0.05'],
    [-12_345, '-123.45'],
    [100_000_000_000, '1000000000.00'],
    [Number.MAX_SAFE_INTEGER, '90071992547409.91'],
  ])('formats %d centavos as %s', (cents, expected) => {
    expect(centavosToPesos(cents)).toBe(expected)
  })

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'rejects %s because it is not a whole safe centavo amount',
    (cents) => {
      expect(() => centavosToPesos(cents)).toThrow(RangeError)
    }
  )
})

describe('toCents', () => {
  it('reads numeric aggregate strings, numbers and bigint', () => {
    expect(toCents('12345')).toBe(12_345)
    expect(toCents('-250')).toBe(-250)
    expect(toCents(77)).toBe(77)
    expect(toCents(BigInt(900))).toBe(900)
  })

  it('treats a missing aggregate as zero', () => {
    expect(toCents(null)).toBe(0)
    expect(toCents(undefined)).toBe(0)
  })

  it.each(['12.5', 'abc', '9007199254740993'])(
    'rejects %s instead of rounding money',
    (value) => {
      expect(() => toCents(value)).toThrow(RangeError)
    }
  )
})
