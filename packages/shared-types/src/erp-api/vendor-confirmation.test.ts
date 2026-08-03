import { describe, expect, it } from 'vitest'
import {
  vendorConfirmationBodySchema,
  vendorConfirmationCommandSchema,
  vendorConfirmationResultSchema,
} from './vendor-confirmation'

const TOKEN = 'b'.repeat(64)
const BODY = {
  decision: 'accepted' as const,
  responderName: ' Ana Reyes ',
  responderEmail: ' ana@example.com ',
}

describe('supplier confirmation contracts', () => {
  it('normalizes responder fields and keeps authority out of the body', () => {
    expect(vendorConfirmationBodySchema.parse(BODY)).toEqual({
      ...BODY,
      responderName: 'Ana Reyes',
      responderEmail: 'ana@example.com',
    })
    expect(
      vendorConfirmationBodySchema.safeParse({
        ...BODY,
        tenantId: 'not-client-authority',
      }).success
    ).toBe(false)
  })

  it('requires a note for a decline or change request', () => {
    expect(
      vendorConfirmationBodySchema.safeParse({
        ...BODY,
        decision: 'declined',
      }).success
    ).toBe(false)
    expect(
      vendorConfirmationBodySchema.safeParse({
        ...BODY,
        decision: 'changes_requested',
        note: 'Please confirm the delivery date.',
      }).success
    ).toBe(true)
  })

  it('accepts only a 64-character hex token in the command', () => {
    expect(
      vendorConfirmationCommandSchema.safeParse({
        token: TOKEN,
        ...BODY,
      }).success
    ).toBe(true)
    expect(
      vendorConfirmationCommandSchema.safeParse({
        token: 'short',
        ...BODY,
      }).success
    ).toBe(false)
  })

  it('requires a typed tenant-scoped result', () => {
    const result = vendorConfirmationResultSchema.parse({
      sessionId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      purchaseOrderId: '33333333-3333-4333-8333-333333333333',
      vendorId: '44444444-4444-4444-8444-444444444444',
      decision: 'accepted',
      respondedAt: '2026-08-03T00:00:00.000Z',
    })
    expect(result.decision).toBe('accepted')
  })
})
