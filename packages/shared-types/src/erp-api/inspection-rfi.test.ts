import { describe, expect, it } from 'vitest'
import { inspectionRfiQuerySchema, inspectionRfiTransitionCommandSchema } from './inspection-rfi'

describe('inspection RFI contracts', () => {
  it('bounds pagination and accepts only known filters', () => {
    expect(inspectionRfiQuerySchema.parse({})).toEqual({ page: 1, limit: 25 })
    expect(inspectionRfiQuerySchema.parse({ status: 'open', priority: 'major', page: '2', limit: '10' })).toEqual({ status: 'open', priority: 'major', page: 2, limit: 10 })
    for (const input of [{ page: 0 }, { limit: 101 }, { status: 'closed' }, { tenantId: 'injected' }]) expect(inspectionRfiQuerySchema.safeParse(input).success).toBe(false)
  })
  it('requires explicit expected state and a bounded reason without actor injection', () => {
    expect(inspectionRfiTransitionCommandSchema.parse({ expectedResolvedAt: null, reason: '  Confirmed on site  ' })).toEqual({ expectedResolvedAt: null, reason: 'Confirmed on site' })
    for (const input of [{ reason: 'done' }, { expectedResolvedAt: null, reason: ' ' }, { expectedResolvedAt: 'yesterday', reason: 'done' }, { expectedResolvedAt: null, reason: 'x'.repeat(2001) }, { expectedResolvedAt: null, reason: 'done', resolvedBy: 'injected' }]) expect(inspectionRfiTransitionCommandSchema.safeParse(input).success).toBe(false)
  })
})
