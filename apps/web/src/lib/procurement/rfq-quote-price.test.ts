import { describe, expect, it } from 'vitest'
import { parseUnitPriceCents } from './rfq-quote-price'

describe('parseUnitPriceCents', () => {
  it.each([
    ['125.50', 12550],
    ['125.5', 12550],
    ['125', 12500],
    [' 0.01 ', 1],
    ['1.00', 100],
  ])('reads %s as %i centavos exactly', (text, cents) => {
    expect(parseUnitPriceCents(text)).toEqual({ cents })
  })

  it.each(['', '   ', '0', '0.00', '00.0'])('refuses blank or zero %j with the price message', (text) => {
    expect(parseUnitPriceCents(text)).toEqual({ error: 'Enter a unit price greater than 0.' })
  })

  it.each(['-5', '1.234', 'abc', '1e3', '1,250.00', '12.'])('refuses %j', (text) => {
    expect(parseUnitPriceCents(text)).toEqual({
      error: expect.stringContaining('at most two decimals'),
    })
  })
})
