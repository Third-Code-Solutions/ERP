import { describe, expect, it } from 'vitest'
import {
  supplierConfirmationInputSchema,
  supplierConfirmedAt,
} from './supplier-confirmation'

const VALID = {
  poId: '44444444-4444-4444-8444-444444444444',
  channel: 'phone',
  confirmedByName: '  Marlon Reyes ',
  confirmedOn: '2026-11-17',
  note: ' Delivery on Friday ',
}

describe('supplierConfirmationInputSchema', () => {
  it('trims the name and the note', () => {
    const parsed = supplierConfirmationInputSchema.parse(VALID)

    expect(parsed.confirmedByName).toBe('Marlon Reyes')
    expect(parsed.note).toBe('Delivery on Friday')
  })

  it.each([
    [{ channel: 'carrier pigeon' }, 'Choose how the supplier confirmed.'],
    [{ confirmedByName: '   ' }, 'Enter who at the supplier confirmed.'],
    [{ confirmedOn: '17/11/2026' }, 'Enter the date the supplier confirmed.'],
    [{ poId: 'nope' }, 'Purchase Order not found.'],
  ])('refuses %j with a plain message', (patch, message) => {
    const result = supplierConfirmationInputSchema.safeParse({ ...VALID, ...patch })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(message)
  })
})

describe('supplierConfirmedAt', () => {
  it('is noon in Manila on that calendar date', () => {
    expect(supplierConfirmedAt('2026-11-17')?.toISOString()).toBe('2026-11-17T04:00:00.000Z')
  })

  it('refuses a date that does not exist', () => {
    expect(supplierConfirmedAt('2026-02-31')).toBeNull()
    expect(supplierConfirmedAt('2026-13-01')).toBeNull()
  })
})
