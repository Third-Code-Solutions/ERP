import { describe, expect, it } from 'vitest'
import { formatReportMargin, formatReportMoney } from './report-format'

describe('exact report presentation', () => {
  it('preserves centavos beyond the JavaScript safe integer limit', () => {
    expect(formatReportMoney(900719925474099199n)).toBe('₱9,007,199,254,740,991.99')
    expect(formatReportMoney(-101n)).toBe('-₱1.01')
    expect(formatReportMoney(0n)).toBe('₱0.00')
  })
  it('rounds margins half-up without monetary floating-point arithmetic', () => {
    expect(formatReportMargin(1n, 16n)).toBe('6.3%')
    expect(formatReportMargin(-1n, 16n)).toBe('-6.3%')
    expect(formatReportMargin(1n, 0n)).toBe('—')
    expect(formatReportMargin(900719925474099199n, 900719925474099199n)).toBe('100.0%')
  })
})
