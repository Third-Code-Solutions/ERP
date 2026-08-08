import { describe, expect, it } from 'vitest'
import {
  cortexAssistantProviderPlanSchema,
  cortexAssistantProviderRequestSchema,
  cortexAssistantProviderResponseSchema,
} from './cortex-assistant-provider-execution'

const NODE_ID = '11111111-1111-4111-8111-111111111111'

describe('Cortex assistant provider execution contracts', () => {
  it('accepts one strict provider-neutral plan and redacted request envelope', () => {
    expect(
      cortexAssistantProviderPlanSchema.parse({
        provider: 'fake',
        model: 'third-code-provider-v1',
        maxCostMicros: '400',
        timeoutMs: 15_000,
      })
    ).toMatchObject({ model: 'third-code-provider-v1', timeoutMs: 15_000 })
    expect(
      cortexAssistantProviderRequestSchema.parse({
        protocolVersion: 1,
        dispatchKey: 'a'.repeat(64),
        provider: 'fake',
        model: 'third-code-provider-v1',
        timeoutMs: 15_000,
        question: 'What changed?',
        evidence: [
          { nodeId: NODE_ID, nodeType: 'project', title: null, summary: null },
        ],
      })
    ).toMatchObject({ protocolVersion: 1, question: 'What changed?' })
  })

  it('rejects internal identity, duplicate evidence, and unbounded timeout', () => {
    const base = {
      protocolVersion: 1,
      dispatchKey: 'a'.repeat(64),
      provider: 'fake',
      model: 'third-code-provider-v1',
      timeoutMs: 15_000,
      question: 'What changed?',
      evidence: [
        { nodeId: NODE_ID, nodeType: 'project', title: null, summary: null },
      ],
    }
    expect(
      cortexAssistantProviderRequestSchema.safeParse({
        ...base,
        tenantId: NODE_ID,
      }).success
    ).toBe(false)
    expect(
      cortexAssistantProviderRequestSchema.safeParse({
        ...base,
        evidence: [...base.evidence, ...base.evidence],
      }).success
    ).toBe(false)
    expect(
      cortexAssistantProviderRequestSchema.safeParse({
        ...base,
        timeoutMs: 60_001,
      }).success
    ).toBe(false)
  })

  it('accepts only a bounded response with an opaque receipt', () => {
    const result = cortexAssistantProviderResponseSchema.parse({
      protocolVersion: 1,
      providerRequestId: 'req_fake_123',
      model: 'third-code-provider-v1',
      content: 'Grounded answer',
      citationNodeIds: [NODE_ID],
      consumedCostMicros: '125',
    })
    expect(result.providerRequestId).toBe('req_fake_123')
    expect(
      cortexAssistantProviderResponseSchema.safeParse({
        ...result,
        providerRequestId: 'receipt contains spaces',
      }).success
    ).toBe(false)
    expect(
      cortexAssistantProviderResponseSchema.safeParse({
        ...result,
        citationNodeIds: [NODE_ID, NODE_ID],
      }).success
    ).toBe(false)
  })
})
