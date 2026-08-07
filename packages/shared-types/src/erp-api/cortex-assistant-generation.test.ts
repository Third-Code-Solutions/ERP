import { describe, expect, it } from 'vitest'
import {
  cortexAssistantGenerationQueueJobSchema,
  cortexAssistantGenerationAcceptedSchema,
  cortexAssistantGenerationResultSchema,
  cortexAssistantGenerationStartCommandSchema,
  cortexAssistantGenerationStatusSchema,
  cortexAssistantGenerationWorkerCompletionSchema,
} from './cortex-assistant-generation'

const ID = '11111111-1111-4111-8111-111111111111'
const TOKEN = '22222222-2222-4222-8222-222222222222'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444'

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

  it('requires terminal success and result payloads to agree', () => {
    const job = {
      jobId: ID,
      requestId: TOKEN,
      status: 'succeeded' as const,
      attemptCount: 1,
      failureCode: null,
      retryable: false,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:01.000Z',
    }
    const result = {
      status: 'succeeded' as const,
      conversationId: CONVERSATION_ID,
      userMessageId: MESSAGE_ID,
      messageId: ID,
      content: 'Grounded answer',
      citations: [],
      outcome: 'deterministic_grounded' as const,
      model: 'deterministic-grounded-v1',
    }
    expect(
      cortexAssistantGenerationResultSchema.parse({ job, result })
    ).toEqual({ job, result })
    expect(() =>
      cortexAssistantGenerationResultSchema.parse({ job, result: null })
    ).toThrow()
    expect(() =>
      cortexAssistantGenerationResultSchema.parse({
        job: { ...job, status: 'processing' },
        result,
      })
    ).toThrow()
  })

  it('bounds browser handoff polling metadata', () => {
    expect(
      cortexAssistantGenerationAcceptedSchema.parse({
        status: 'accepted',
        jobId: ID,
        conversationId: CONVERSATION_ID,
        retryAfterMs: 1_000,
      })
    ).toMatchObject({ status: 'accepted', retryAfterMs: 1_000 })
    expect(() =>
      cortexAssistantGenerationAcceptedSchema.parse({
        status: 'accepted',
        jobId: ID,
        conversationId: CONVERSATION_ID,
        retryAfterMs: 10_000,
      })
    ).toThrow()
  })
})
