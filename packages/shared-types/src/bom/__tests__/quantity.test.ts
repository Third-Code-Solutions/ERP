import { describe, expect, it } from 'vitest'

import { bomTotalCost, lineTotal, manualLineTotal } from '../calculations'
import { deriveBoqLineAmount } from '../dupa'
import {
  boqQuantityFromNumber,
  boqQuantityToMicros,
  formatBoqQuantity,
  parseBoqQuantity,
} from '../quantity'

// D-5: BOQ quantity is numeric(18,4). Amount = half-up round(rate x qty),
// computed exactly; money stays integer centavos.
describe('parseBoqQuantity', () => {
  it('normalizes exact decimal strings with up to 4 decimal places', () => {
    expect(parseBoqQuantity('12.5')).toBe('12.5')
    expect(parseBoqQuantity('12.50')).toBe('12.5')
    expect(parseBoqQuantity('12.5000')).toBe('12.5')
    expect(parseBoqQuantity(' 3.25 ')).toBe('3.25')
    expect(parseBoqQuantity('0.0001')).toBe('0.0001')
    expect(parseBoqQuantity('.5')).toBe('0.5')
    expect(parseBoqQuantity('12.')).toBe('12')
    expect(parseBoqQuantity('007')).toBe('7')
    expect(parseBoqQuantity('0')).toBe('0')
    expect(parseBoqQuantity('2147483647')).toBe('2147483647')
  })

  it('rejects more than 4 decimal places, signs, exponents, separators and out-of-range values', () => {
    for (const input of [
      '0.00001',
      '1.23456',
      '-1',
      '+1',
      '1e3',
      '1,000',
      '',
      '.',
      'abc',
      '2147483647.0001',
      '9'.repeat(33),
    ]) {
      expect(parseBoqQuantity(input)).toBeNull()
    }
  })
})

describe('boqQuantityFromNumber', () => {
  it('reads numbers with up to 4 decimal places exactly', () => {
    expect(boqQuantityFromNumber(0.1)).toBe('0.1')
    expect(boqQuantityFromNumber(12.5)).toBe('12.5')
    expect(boqQuantityFromNumber(0.0001)).toBe('0.0001')
    expect(boqQuantityFromNumber(4)).toBe('4')
  })

  it('rejects finer, negative and non-finite numbers instead of rounding', () => {
    for (const value of [0.00001, 1e-7, -0.5, Number.NaN, Number.POSITIVE_INFINITY, 1e21]) {
      expect(boqQuantityFromNumber(value)).toBeNull()
    }
  })
})

describe('BOQ line amount', () => {
  it('prices the PRD 4.2 example: 0.10 cu.m x H 16,217,500 = 1,621,750', () => {
    expect(manualLineTotal(16_217_500, '0.10')).toBe(1_621_750)
    expect(deriveBoqLineAmount(16_217_500n, '0.10')).toBe(1_621_750n)
  })

  it('prices a 12.5 sqm takeoff area exactly, rounding the tie half-up', () => {
    expect(manualLineTotal(85_050, '12.5')).toBe(1_063_125)
    expect(manualLineTotal(12_345, '12.5')).toBe(154_313)
  })

  it('rounds at the 0.0001 boundary half-up', () => {
    expect(manualLineTotal(5_000, '0.0001')).toBe(1)
    expect(manualLineTotal(4_999, '0.0001')).toBe(0)
    expect(manualLineTotal(1, '0.0001')).toBe(0)
  })

  it('rounds the marked-up product once', () => {
    expect(lineTotal(100, '2.5', 3_000)).toBe(325)
    expect(lineTotal(333, '1.5', 3_000)).toBe(649)
  })

  it('rejects a quantity finer than 4 decimal places', () => {
    expect(() => manualLineTotal(100, '0.00001')).toThrow(RangeError)
  })

  it('foots a messy multi-line BOM as the sum of per-line half-up amounts', () => {
    const lines: Array<[number, string, number]> = [
      [12_345, '12.5', 154_313], // 154,312.5 -> tie up
      [16_217_500, '0.10', 1_621_750],
      [3, '3.3333', 10], // 9.9999
      [5_000, '0.0001', 1], // 0.5 -> tie up
      [1_001, '7.25', 7_257], // 7,257.25
      [101, '2.5', 253], // 252.5 -> tie up
    ]
    const amounts = lines.map(([rate, quantity, expected]) => {
      const amount = manualLineTotal(rate, quantity)
      expect(amount).toBe(expected)
      expect(deriveBoqLineAmount(BigInt(rate), quantity)).toBe(BigInt(expected))
      return { line_total_cents: amount }
    })
    // Rounding the unrounded sum (1,783,582.7499) once would give 1,783,583.
    expect(bomTotalCost(amounts)).toBe(1_783_584)
  })
})

describe('BOQ quantity conversions', () => {
  it('converts to purchase-order micros exactly', () => {
    expect(boqQuantityToMicros('12.5')).toBe(12_500_000)
    expect(boqQuantityToMicros('0.0001')).toBe(100)
    expect(boqQuantityToMicros('2147483647')).toBe(2_147_483_647_000_000)
  })

  it('formats for display with grouping and no trailing zeros', () => {
    expect(formatBoqQuantity('12345.5000')).toBe('12,345.5')
    expect(formatBoqQuantity('0.1000')).toBe('0.1')
    expect(formatBoqQuantity('1234567')).toBe('1,234,567')
  })
})
