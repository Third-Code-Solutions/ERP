import { describe, expect, it } from 'vitest'
import { nextInvoiceNumber } from './invoice-number'

describe('nextInvoiceNumber', () => {
  it('advances numerically across the three-digit display boundary', () => {
    expect(nextInvoiceNumber('INV-202609-', '1000')).toBe('INV-202609-1001')
  })

  it('starts at one for an empty or malformed suffix', () => {
    expect(nextInvoiceNumber('INV-202609-', null)).toBe('INV-202609-001')
    expect(nextInvoiceNumber('INV-202609-', 'not-a-number')).toBe('INV-202609-001')
  })

  it('keeps long suffixes exact', () => {
    expect(nextInvoiceNumber('INV-202609-', '9007199254740992')).toBe('INV-202609-9007199254740993')
  })
})
