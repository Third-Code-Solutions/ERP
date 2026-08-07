import { describe, expect, it } from 'vitest'
import {
  cortexSemanticIndexCommandSchema,
  cortexSemanticIndexQueueJobSchema,
  cortexSemanticIndexStatusSchema,
} from './cortex-semantic-index'

describe('Cortex semantic index contracts', () => {
  it('requires explicit consent and the fixed one-call batch ceiling', () => {
    expect(
      cortexSemanticIndexCommandSchema.parse({ maxNodes: 64, costConsent: true })
    ).toEqual({ maxNodes: 64, costConsent: true })
    expect(() =>
      cortexSemanticIndexCommandSchema.parse({ maxNodes: 128, costConsent: true })
    ).toThrow()
    expect(() =>
      cortexSemanticIndexCommandSchema.parse({ maxNodes: 64, costConsent: false })
    ).toThrow()
  })

  it('keeps the Redis envelope identity-only', () => {
    const data = cortexSemanticIndexQueueJobSchema.parse({
      schemaVersion: 1,
      jobId: '11111111-1111-4111-8111-111111111111',
    })
    expect(Object.keys(data)).toEqual(['schemaVersion', 'jobId'])
    expect(() =>
      cortexSemanticIndexQueueJobSchema.parse({
        ...data,
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
    ).toThrow()
  })

  it('rejects status that exceeds provider and attempt ceilings', () => {
    const base = {
      jobId: '11111111-1111-4111-8111-111111111111',
      status: 'processing' as const,
      maxNodes: 64 as const,
      backlogAtRequest: 70,
      processedNodes: 0,
      attempts: 1,
      providerCalls: 1,
      failureCode: null,
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:01:00.000Z',
    }
    expect(cortexSemanticIndexStatusSchema.parse(base)).toEqual(base)
    expect(() =>
      cortexSemanticIndexStatusSchema.parse({ ...base, providerCalls: 2 })
    ).toThrow()
    expect(() =>
      cortexSemanticIndexStatusSchema.parse({ ...base, attempts: 4 })
    ).toThrow()
  })
})
