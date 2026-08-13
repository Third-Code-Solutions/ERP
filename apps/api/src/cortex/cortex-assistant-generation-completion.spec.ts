import { describe, expect, it } from 'vitest'
import { cortexAssistantGenerationCompletionHash } from './cortex-assistant-generation-completion'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const NODE_ID = '33333333-3333-4333-8333-333333333333'

describe('cortexAssistantGenerationCompletionHash', () => {
  it('preserves the existing deterministic completion digest', () => {
    expect(
      cortexAssistantGenerationCompletionHash({
        jobId: JOB_ID,
        requestId: REQUEST_ID,
        completion: {
          outcome: 'deterministic_grounded',
          content: 'Grounded.',
          citationNodeIds: [NODE_ID],
          model: 'deterministic-grounded-v1',
        },
      })
    ).toBe('04420b196f45d3fbf028a91b915a950e2643419715d5dbed43a602897204e7d1')
  })

  it('binds a provider completion to the exact provider attempt', () => {
    const completion = {
      outcome: 'provider_grounded' as const,
      providerAttemptId: '44444444-4444-4444-8444-444444444444',
      content: 'Grounded.',
      citationNodeIds: [NODE_ID],
      model: 'third-code-provider-v1',
    }
    const expected = cortexAssistantGenerationCompletionHash({
      jobId: JOB_ID,
      requestId: REQUEST_ID,
      completion,
    })
    expect(
      cortexAssistantGenerationCompletionHash({
        jobId: JOB_ID,
        requestId: REQUEST_ID,
        completion: {
          ...completion,
          providerAttemptId: '55555555-5555-4555-8555-555555555555',
        },
      })
    ).not.toBe(expected)
  })
})
