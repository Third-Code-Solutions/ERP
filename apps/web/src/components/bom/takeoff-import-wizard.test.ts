import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { formatTakeoffQuantity, takeoffCommitNotice } from './takeoff-import-wizard'

describe('takeoffCommitNotice', () => {
  it('tells the importer how many earlier lines the file rewrote', () => {
    expect(takeoffCommitNotice(3)).toMatch(/^3 lines already on this BOM were updated from the file/)
    expect(takeoffCommitNotice(1)).toMatch(/^1 line already on this BOM was updated from the file/)
  })

  it('says nothing when no earlier line changed or an older Core did not report it', () => {
    expect(takeoffCommitNotice(0)).toBeNull()
    expect(takeoffCommitNotice(undefined)).toBeNull()
  })
})

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
    expect(formatTakeoffQuantity(1e-7)).toBe('1e-7')
    expect(formatTakeoffQuantity(2147483647.0001)).toBe('2147483647.0001')
  })
})
