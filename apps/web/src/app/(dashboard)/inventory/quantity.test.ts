import { describe, expect, it } from 'vitest'
import {
  quantityToMicros,
  receiptLineTotal,
  signedQuantityToMicros,
} from './quantity'

describe('inventory quantity arithmetic', () => {
  it('parses whole and fractional quantities exactly', () => {
    expect(quantityToMicros('4')).toBe(4_000_000)
    expect(quantityToMicros('4.25')).toBe(4_250_000)
    expect(quantityToMicros('0.000001')).toBe(1)
  })

  it('rejects floating precision and invalid quantities', () => {
    expect(() => quantityToMicros('1.0000001')).toThrow(
      'up to six decimal places'
    )
    expect(() => quantityToMicros('0')).toThrow('must be positive')
    expect(() => quantityToMicros('-1')).toThrow(
      'up to six decimal places'
    )
  })

  it('rounds receipt value to the nearest minor unit', () => {
    expect(receiptLineTotal(1_500_000, 10_001)).toBe(15_002)
    expect(receiptLineTotal(500_000, 1)).toBe(1)
  })

  it('rejects zero-valued and unsafe receipt evidence', () => {
    expect(() => receiptLineTotal(1, 0)).toThrow(
      'must be positive and within range'
    )
    expect(() =>
      receiptLineTotal(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    ).toThrow('must be positive and within range')
  })

  it('preserves signed count-adjustment direction', () => {
    expect(signedQuantityToMicros('2.5')).toBe(2_500_000)
    expect(signedQuantityToMicros('-2.5')).toBe(-2_500_000)
  })

  it('rejects signed zero and excessive precision', () => {
    expect(() => signedQuantityToMicros('0')).toThrow()
    expect(() => signedQuantityToMicros('-0')).toThrow()
    expect(() => signedQuantityToMicros('1.0000001')).toThrow()
  })
})
