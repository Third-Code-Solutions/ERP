import { describe, expect, it } from 'vitest'

import {
  formatPurchaseOrderNumber,
  parseCanonicalPurchaseOrderNumber,
} from './purchase-order-number'

describe('Purchase Order number format', () => {
  it('formats positive sequence values with the established PO prefix', () => {
    expect(formatPurchaseOrderNumber(1)).toBe('PO-0001')
    expect(formatPurchaseOrderNumber(42)).toBe('PO-0042')
    expect(formatPurchaseOrderNumber(10000)).toBe('PO-10000')
  })

  it('parses only canonical PO numbers', () => {
    expect(parseCanonicalPurchaseOrderNumber('PO-0001')).toBe(1)
    expect(parseCanonicalPurchaseOrderNumber('PO-2026-0001')).toBeNull()
    expect(parseCanonicalPurchaseOrderNumber('PO-0000')).toBeNull()
    expect(parseCanonicalPurchaseOrderNumber(null)).toBeNull()
  })

  it('rejects invalid sequence values before they reach persistence', () => {
    expect(() => formatPurchaseOrderNumber(0)).toThrow()
    expect(() => formatPurchaseOrderNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow()
  })
})
