import { describe, expect, it } from 'vitest'
import {
  cortexConversationContextResolveQuerySchema,
  cortexConversationContextResolveResponseSchema,
} from './cortex-conversation-context'

const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'

describe('Cortex conversation owner/context contract', () => {
  it('accepts an unscoped owner lookup', () => {
    expect(
      cortexConversationContextResolveQuerySchema.parse({
        conversationId: CONVERSATION_ID,
      })
    ).toEqual({ conversationId: CONVERSATION_ID })
  })

  it('parses JSON focus transport without accepting caller identity', () => {
    expect(
      cortexConversationContextResolveQuerySchema.parse({
        context: JSON.stringify({ refTable: 'projects', refId: REF_ID }),
      })
    ).toEqual({ context: { refTable: 'projects', refId: REF_ID } })
    expect(() =>
      cortexConversationContextResolveQuerySchema.parse({
        tenantId: 'caller-selected',
      })
    ).toThrow()
  })

  it('rejects malformed or incomplete focus values', () => {
    expect(() =>
      cortexConversationContextResolveQuerySchema.parse({
        context: JSON.stringify({ refTable: 'projects' }),
      })
    ).toThrow()
  })

  it('keeps unregistered source names transport-valid for Core 404 parity', () => {
    expect(
      cortexConversationContextResolveQuerySchema.parse({
        context: { refTable: 'private_records', refId: REF_ID },
      })
    ).toEqual({
      context: { refTable: 'private_records', refId: REF_ID },
    })
  })

  it('keeps the response bounded to owner identity and authorized context', () => {
    expect(
      cortexConversationContextResolveResponseSchema.parse({
        conversationId: CONVERSATION_ID,
        context: null,
      })
    ).toEqual({ conversationId: CONVERSATION_ID, context: null })
  })
})
