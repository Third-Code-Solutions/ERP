import { describe, expect, it } from 'vitest'
import { multiplyCents, parsePesosToCents } from './scope-money'

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
