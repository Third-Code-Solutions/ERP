import { describe, expect, it } from 'vitest'
import { bpsToPercentLabel } from './percent'

describe('bpsToPercentLabel', () => {
  it('keeps fractional percents instead of rounding them', () => {
    expect(bpsToPercentLabel(1250)).toBe('12.5')
    expect(bpsToPercentLabel(1000)).toBe('10')
    expect(bpsToPercentLabel(333)).toBe('3.33')
  })
})
