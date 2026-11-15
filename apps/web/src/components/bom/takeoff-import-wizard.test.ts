import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { formatTakeoffQuantity } from './takeoff-import-wizard'

describe('formatTakeoffQuantity', () => {
  it('shows a preview quantity in the BOQ display form', () => {
    expect(formatTakeoffQuantity(12345.5)).toBe('12,345.5')
    expect(formatTakeoffQuantity(1234567)).toBe('1,234,567')
    expect(formatTakeoffQuantity(0.0001)).toBe('0.0001')
  })

  it('shows a missing quantity as a dash and a value BOQ rejects as received', () => {
    expect(formatTakeoffQuantity(null)).toBe('—')
    expect(formatTakeoffQuantity(1.23456)).toBe('1.23456')
    expect(formatTakeoffQuantity(-2)).toBe('-2')
  })
})
