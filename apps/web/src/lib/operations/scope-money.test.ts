import { describe, expect, it } from 'vitest'
import { multiplyCents, parseOpportunityCents, parsePesosToCents } from './scope-money'

describe('parseOpportunityCents', () => {
  it('reads blank as zero and exact pesos as centavos', () => {
    expect(parseOpportunityCents('')).toBe(0)
    expect(parseOpportunityCents(null)).toBe(0)
    expect(parseOpportunityCents('1234.5')).toBe(123_450)
  })

  it('allows a negative amount only when signed', () => {
    expect(parseOpportunityCents('-10', { signed: true })).toBe(-1_000)
    expect(parseOpportunityCents('-10')).toBeUndefined()
  })

  it('refuses amounts above the opportunity cap and malformed text', () => {
    expect(parseOpportunityCents('1000000000')).toBe(100_000_000_000)
    expect(parseOpportunityCents('1000000000.01')).toBeUndefined()
    expect(parseOpportunityCents('1.234')).toBeUndefined()
    expect(parseOpportunityCents('1'.repeat(40))).toBeUndefined()
  })
})

describe('scope money parsing', () => {
  it('parses exact peso text into centavos', () => {
    expect(parsePesosToCents('1,250.50')).toBeUndefined()
    expect(parsePesosToCents('1250.5')).toBe(125050)
    expect(parsePesosToCents('0.1')).toBe(10)
    expect(parsePesosToCents('0')).toBe(0)
  })

  it('rejects ambiguous or over-precise input', () => {
    expect(parsePesosToCents('-1')).toBeUndefined()
    expect(parsePesosToCents('1.005')).toBeUndefined()
    expect(parsePesosToCents('1e3')).toBeUndefined()
    expect(parsePesosToCents('9007199254740991.99')).toBeUndefined()
  })

  it('multiplies centavos with overflow protection', () => {
    expect(multiplyCents(125050, 2)).toBe(250100)
    expect(multiplyCents(Number.MAX_SAFE_INTEGER, 2)).toBeUndefined()
    expect(multiplyCents(-1, 2)).toBeUndefined()
  })
})
