import { describe, expect, it } from 'vitest'
import {
  cortexConversationDetailResponseSchema,
  cortexConversationListResponseSchema,
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
})
