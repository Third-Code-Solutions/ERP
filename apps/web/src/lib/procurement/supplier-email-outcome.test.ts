import { describe, expect, it } from 'vitest'
import {
  formatPoEmailLines,
  supplierEmailNotice,
  supplierEmailOutcomeMessage,
  supplierEmailResendThrottledMessage,
  supplierEmailResendWaitMinutes,
  supplierEmailTarget,
} from './supplier-email-outcome'

describe('supplierEmailResendWaitMinutes', () => {
  const NOW = new Date('2026-11-24T09:00:00.000Z')

  it('lets a PO with no delivered email go now', () => {
    expect(supplierEmailResendWaitMinutes(null, NOW)).toBe(0)
  })

  it('waits out ten minutes from the last delivered email, rounding up', () => {
    expect(supplierEmailResendWaitMinutes(NOW, NOW)).toBe(10)
    expect(supplierEmailResendWaitMinutes('2026-11-24T08:50:30.000Z', NOW)).toBe(1)
    expect(supplierEmailResendWaitMinutes('2026-11-24T08:50:00.000Z', NOW)).toBe(0)
    expect(supplierEmailResendWaitMinutes('2026-11-23T09:00:00.000Z', NOW)).toBe(0)
  })

  it('says how long to wait', () => {
    expect(supplierEmailResendThrottledMessage(1)).toBe(
      'The supplier was emailed this Purchase Order a few minutes ago. Try again in 1 minute.'
    )
    expect(supplierEmailResendThrottledMessage(10)).toContain('Try again in 10 minutes.')
  })
})

describe('supplierEmailTarget', () => {
  it('needs a vendor first, then an address', () => {
    expect(supplierEmailTarget({ vendorId: null, supplierEmail: 'a@b.ph' })).toBe('no_vendor')
    expect(supplierEmailTarget({ vendorId: 'v1', supplierEmail: null })).toBe('no_email')
    expect(supplierEmailTarget({ vendorId: 'v1', supplierEmail: '   ' })).toBe('no_email')
    expect(supplierEmailTarget({ vendorId: 'v1', supplierEmail: 'a@b.ph' })).toBe('ready')
  })
})

describe('supplierEmailOutcomeMessage', () => {
  it('has plain-language text for every outcome and no arrows or dashes', () => {
    for (const outcome of ['sent', 'no_vendor', 'no_email', 'provider_error'] as const) {
      const message = supplierEmailOutcomeMessage(outcome)
      expect(message.length).toBeGreaterThan(10)
      expect(message).not.toMatch(/[—–→]/)
    }
    expect(supplierEmailOutcomeMessage('no_email')).toContain('no email address on file')
  })
})

describe('supplierEmailNotice', () => {
  const base = { status: 'issued', supplierEmailSentAt: null, vendorId: 'v1', supplierEmail: 'a@b.ph' }

  it('stays quiet once the email is on record as sent', () => {
    expect(supplierEmailNotice({ ...base, supplierEmailSentAt: new Date() })).toBeNull()
  })

  it('stays quiet for a PO that is not issued yet', () => {
    expect(supplierEmailNotice({ ...base, status: 'pending_scm_issuance' })).toBeNull()
    expect(supplierEmailNotice({ ...base, status: 'cancelled' })).toBeNull()
  })

  it('names the reason the supplier has not been emailed', () => {
    expect(supplierEmailNotice({ ...base, vendorId: null })?.outcome).toBe('no_vendor')
    expect(supplierEmailNotice({ ...base, supplierEmail: null })?.outcome).toBe('no_email')
    const notice = supplierEmailNotice(base)
    expect(notice?.outcome).toBe('provider_error')
    expect(notice?.message).toContain('Resend supplier email')
  })
})

describe('formatPoEmailLines', () => {
  it('lists every line with quantity, unit price and total', () => {
    const text = formatPoEmailLines([
      { code: 'CEM-40', description: 'Cement 40kg', unit: 'bag', quantityMicros: 12_500_000, unitCostCents: 25_050, lineTotalCents: 313_125 },
      { code: null, description: 'Delivery', unit: null, quantityMicros: 1_000_000, unitCostCents: 100_000, lineTotalCents: 100_000 },
    ])

    expect(text.split('\n')).toEqual([
      '1. CEM-40 Cement 40kg: 12.5 bag at PHP 250.50 = PHP 3,131.25',
      '2. Delivery: 1 at PHP 1,000.00 = PHP 1,000.00',
    ])
  })
})
