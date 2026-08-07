import { describe, expect, it } from 'vitest'
import {
  cortexAssistantProviderAttemptResultSchema,
  cortexAssistantProviderReleaseCommandSchema,
  cortexAssistantProviderReservationCommandSchema,
  cortexAssistantProviderSettlementCommandSchema,
} from './cortex-assistant-provider-budget'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const RESERVATION_ID = '22222222-2222-4222-8222-222222222222'

describe('Cortex assistant provider budget contracts', () => {
  it('accepts one strict, exact-micros reservation command', () => {
    expect(
      cortexAssistantProviderReservationCommandSchema.parse({
        jobId: JOB_ID,
        attemptNumber: 1,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        maxCostMicros: '250000',
      })
    ).toEqual({
      jobId: JOB_ID,
      attemptNumber: 1,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      maxCostMicros: '250000',
    })
  })

  it('rejects floating, zero, oversized, and unknown reservation input', () => {
    const base = {
      jobId: JOB_ID,
      attemptNumber: 1,
      provider: 'openai',
      model: 'gpt-4.1-mini',
    }
    for (const maxCostMicros of [
      '0',
      '1.5',
      '1000000000000',
      '01',
      '-1',
    ]) {
      expect(
        cortexAssistantProviderReservationCommandSchema.safeParse({
          ...base,
          maxCostMicros,
        }).success
      ).toBe(false)
    }
    expect(
      cortexAssistantProviderReservationCommandSchema.safeParse({
        ...base,
        maxCostMicros: '1',
        tenantId: JOB_ID,
      }).success
    ).toBe(false)
  })

  it('bounds terminal outcome and exact settlement cost', () => {
    expect(
      cortexAssistantProviderSettlementCommandSchema.parse({
        reservationId: RESERVATION_ID,
        consumedCostMicros: '0',
        outcomeCode: 'provider_succeeded',
      })
    ).toMatchObject({ consumedCostMicros: '0' })
    expect(
      cortexAssistantProviderReleaseCommandSchema.safeParse({
        reservationId: RESERVATION_ID,
        outcomeCode: 'Provider failed',
      }).success
    ).toBe(false)
  })

  it('enforces open, settled, and released result payloads', () => {
    const base = {
      reservationId: RESERVATION_ID,
      jobId: JOB_ID,
      attemptNumber: 1,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      reservedCostMicros: '250000',
      budgetDate: '2026-08-08',
      replayed: false,
    }
    expect(
      cortexAssistantProviderAttemptResultSchema.safeParse({
        ...base,
        status: 'reserved',
        consumedCostMicros: null,
        outcomeCode: null,
      }).success
    ).toBe(true)
    expect(
      cortexAssistantProviderAttemptResultSchema.safeParse({
        ...base,
        status: 'released',
        consumedCostMicros: '1',
        outcomeCode: 'provider_not_dispatched',
      }).success
    ).toBe(false)
    expect(
      cortexAssistantProviderAttemptResultSchema.safeParse({
        ...base,
        status: 'settled',
        consumedCostMicros: '200000',
        outcomeCode: null,
      }).success
    ).toBe(false)
  })
})
