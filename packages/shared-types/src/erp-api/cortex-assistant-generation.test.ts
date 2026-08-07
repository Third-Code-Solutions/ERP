import { describe, expect, it } from 'vitest'
import {
  cortexAssistantGenerationQueueJobSchema,
  cortexAssistantGenerationStartCommandSchema,
  cortexAssistantGenerationStatusSchema,
  cortexAssistantGenerationWorkerCompletionSchema,
} from './cortex-assistant-generation'

const ID = '11111111-1111-4111-8111-111111111111'
const TOKEN = '22222222-2222-4222-8222-222222222222'

describe('Cortex assistant generation contracts', () => {
  it('accepts bounded start and queue payloads', () => {
    expect(
      cortexAssistantGenerationStartCommandSchema.parse({
        requestId: ID,
        claimToken: TOKEN,
      })
    ).toEqual({ requestId: ID, claimToken: TOKEN })
    expect(
      cortexAssistantGenerationQueueJobSchema.parse({
        schemaVersion: 1,
        jobId: ID,
      })
    ).toEqual({ schemaVersion: 1, jobId: ID })
  })

  it('rejects unbounded or inconsistent status data', () => {
    const base = {
      jobId: ID,
      requestId: ID,
      status: 'failed',
      attemptCount: 3,
      failureCode: 'worker_unavailable',
      retryable: false,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:01.000Z',
    }
    expect(cortexAssistantGenerationStatusSchema.parse(base)).toEqual(base)
    expect(() =>
      cortexAssistantGenerationStatusSchema.parse({ ...base, attemptCount: 4 })
    ).toThrow()
    expect(() =>
      cortexAssistantGenerationStatusSchema.parse({ ...base, extra: true })
    ).toThrow()
  })

  it('accepts only bounded deterministic worker completion evidence', () => {
    expect(
      cortexAssistantGenerationWorkerCompletionSchema.parse({
        content: 'Grounded answer',
        citationNodeIds: [ID],
        model: 'deterministic-grounded-v1',
      })
    ).toMatchObject({ content: 'Grounded answer', citationNodeIds: [ID] })
    expect(() =>
      cortexAssistantGenerationWorkerCompletionSchema.parse({
        content: 'Grounded answer',
        citationNodeIds: [ID, ID],
        model: 'deterministic-grounded-v1',
      })
    ).toThrow()
  })
})
