import { describe, expect, it } from 'vitest'
import {
  cortexConversationAssistantTurnClaimCommandSchema,
  cortexConversationAssistantTurnClaimResultSchema,
  cortexConversationAssistantTurnCompleteCommandSchema,
  cortexConversationAssistantTurnCompleteResultSchema,
  cortexConversationAssistantTurnSignaturePayload,
  cortexConversationDetailResponseSchema,
  cortexConversationListResponseSchema,
  cortexConversationUserTurnCommandSchema,
  cortexConversationUserTurnResultSchema,
} from './cortex-conversations'

const ID = '11111111-1111-4111-8111-111111111111'
const TIMESTAMP = '2026-08-07T00:00:00.000Z'

describe('Cortex conversation API contracts', () => {
  it('accepts the compatibility list projection only', () => {
    expect(
      cortexConversationListResponseSchema.parse({
        conversations: [
          {
            id: ID,
            title: 'Project memory',
            created_at: TIMESTAMP,
            updated_at: TIMESTAMP,
            context: null,
          },
        ],
      })
    ).toMatchObject({ conversations: [{ id: ID }] })

    expect(() =>
      cortexConversationListResponseSchema.parse({
        conversations: [],
        tenantId: ID,
      })
    ).toThrow()
  })

  it('rejects stored citation metadata outside the public projection', () => {
    expect(() =>
      cortexConversationDetailResponseSchema.parse({
        context: null,
        messages: [
          {
            role: 'assistant',
            content: 'Grounded answer',
            created_at: TIMESTAMP,
            citations: [{ nodeId: ID, storedTitle: 'Never trust me' }],
          },
        ],
      })
    ).toThrow()
  })

  it('accepts only a user turn without caller-owned identity or role', () => {
    expect(
      cortexConversationUserTurnCommandSchema.parse({
        content: 'What changed on this project?',
        context: { refTable: 'projects', refId: ID },
      })
    ).toMatchObject({ content: 'What changed on this project?' })

    expect(() =>
      cortexConversationUserTurnCommandSchema.parse({
        content: 'Hello',
        tenantId: ID,
      })
    ).toThrow()
    expect(() =>
      cortexConversationUserTurnCommandSchema.parse({
        content: '   ',
      })
    ).toThrow()
  })

  it('keeps the durable user-turn result bounded', () => {
    expect(
      cortexConversationUserTurnResultSchema.parse({
        conversationId: ID,
        messageId: '22222222-2222-4222-8222-222222222222',
        status: 'created',
      })
    ).toMatchObject({ conversationId: ID, status: 'created' })
  })

  it('binds assistant generation claims to an official user turn only', () => {
    expect(
      cortexConversationAssistantTurnClaimCommandSchema.parse({
        conversationId: ID,
        userMessageId: '22222222-2222-4222-8222-222222222222',
      })
    ).toMatchObject({ conversationId: ID })
    expect(() =>
      cortexConversationAssistantTurnClaimCommandSchema.parse({
        conversationId: ID,
        userMessageId: '22222222-2222-4222-8222-222222222222',
        role: 'assistant',
      })
    ).toThrow()
  })

  it('accepts only bounded assistant claim states', () => {
    expect(
      cortexConversationAssistantTurnClaimResultSchema.parse({
        status: 'claimed',
        conversationId: ID,
        userMessageId: '22222222-2222-4222-8222-222222222222',
        requestId: '33333333-3333-4333-8333-333333333333',
        claimToken: '44444444-4444-4444-8444-444444444444',
        leaseExpiresAt: TIMESTAMP,
      })
    ).toMatchObject({ status: 'claimed' })
    expect(() =>
      cortexConversationAssistantTurnClaimResultSchema.parse({
        status: 'in_progress',
        conversationId: ID,
        userMessageId: '22222222-2222-4222-8222-222222222222',
        retryAfterSeconds: 301,
      })
    ).toThrow()
  })

  it('rejects caller-selected assistant authority and duplicate citations', () => {
    const command = {
      requestId: '33333333-3333-4333-8333-333333333333',
      claimToken: '44444444-4444-4444-8444-444444444444',
      content: 'Grounded answer',
      citationNodeIds: [ID],
      outcome: 'deterministic_grounded',
      model: 'deterministic-grounded',
    } as const
    expect(
      cortexConversationAssistantTurnCompleteCommandSchema.parse(command)
    ).toMatchObject({ outcome: 'deterministic_grounded' })
    expect(() =>
      cortexConversationAssistantTurnCompleteCommandSchema.parse({
        ...command,
        citationNodeIds: [ID, ID],
      })
    ).toThrow()
    expect(() =>
      cortexConversationAssistantTurnCompleteCommandSchema.parse({
        ...command,
        tenantId: ID,
      })
    ).toThrow()
    expect(() =>
      cortexConversationAssistantTurnCompleteCommandSchema.parse({
        ...command,
        outcome: 'provider_grounded',
      })
    ).toThrow()
  })

  it('keeps assistant completion results and signatures deterministic', () => {
    expect(
      cortexConversationAssistantTurnCompleteResultSchema.parse({
        status: 'created',
        conversationId: ID,
        userMessageId: '22222222-2222-4222-8222-222222222222',
        messageId: '55555555-5555-4555-8555-555555555555',
      })
    ).toMatchObject({ status: 'created' })

    expect(
      cortexConversationAssistantTurnSignaturePayload({
        operation: 'claim',
        timestamp: '1786120000',
        tenantId: ID,
        userId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: 'request-key',
        commandDigest: 'a'.repeat(64),
      })
    ).toBe(
      '{"version":"v1","operation":"claim","timestamp":"1786120000","tenantId":"11111111-1111-4111-8111-111111111111","userId":"22222222-2222-4222-8222-222222222222","idempotencyKey":"request-key","commandDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
    )
  })
})
