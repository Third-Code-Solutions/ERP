import { describe, expect, it } from 'vitest'
import {
  cortexAgentContextsMatch,
  cortexAgentContextHref,
  cortexAgentContextLabel,
  cortexConversationUrl,
  filterCortexConversations,
  type CortexAgentContext,
} from './agent-context'

const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'

const PROJECT_CONTEXT: CortexAgentContext = {
  refTable: 'projects',
  refId: '11111111-1111-4111-8111-111111111111',
  nodeType: 'project',
  title: 'Harbour Tower',
}

describe('Cortex agent context presentation contract', () => {
  it('matches only the same immutable canonical record pair', () => {
    expect(cortexAgentContextsMatch(null, null)).toBe(true)
    expect(cortexAgentContextsMatch(PROJECT_CONTEXT, null)).toBe(false)
    expect(
      cortexAgentContextsMatch(PROJECT_CONTEXT, {
        ...PROJECT_CONTEXT,
        title: 'Renamed presentation',
      })
    ).toBe(true)
    expect(
      cortexAgentContextsMatch(PROJECT_CONTEXT, {
        ...PROJECT_CONTEXT,
        refId: '22222222-2222-4222-8222-222222222222',
      })
    ).toBe(false)
  })

  it('builds an explicit focused Cortex route without trusting the title', () => {
    expect(cortexAgentContextHref(PROJECT_CONTEXT)).toBe(
      '/cortex?refTable=projects&refId=11111111-1111-4111-8111-111111111111'
    )
    expect(
      cortexAgentContextHref(PROJECT_CONTEXT, CONVERSATION_ID)
    ).toBe(
      '/cortex?refTable=projects&refId=11111111-1111-4111-8111-111111111111&conversationId=33333333-3333-4333-8333-333333333333'
    )
    expect(cortexAgentContextHref(null, CONVERSATION_ID)).toBe(
      '/cortex?conversationId=33333333-3333-4333-8333-333333333333'
    )
    expect(cortexAgentContextHref(null)).toBe('/cortex')
  })

  it('adds or removes a conversation deep link without losing record focus', () => {
    const focused =
      'https://local.invalid/cortex?refTable=projects&refId=11111111-1111-4111-8111-111111111111'

    expect(cortexConversationUrl(focused, CONVERSATION_ID)).toBe(
      '/cortex?refTable=projects&refId=11111111-1111-4111-8111-111111111111&conversationId=33333333-3333-4333-8333-333333333333'
    )
    expect(
      cortexConversationUrl(
        `${focused}&conversationId=${CONVERSATION_ID}`,
        null
      )
    ).toBe(
      '/cortex?refTable=projects&refId=11111111-1111-4111-8111-111111111111'
    )
  })

  it('uses a human record label with a bounded fallback', () => {
    expect(cortexAgentContextLabel(PROJECT_CONTEXT)).toBe(
      'Harbour Tower · Project'
    )
    expect(
      cortexAgentContextLabel({
        ...PROJECT_CONTEXT,
        nodeType: 'future_record',
        title: null,
      })
    ).toBe('Future record')
  })

  it('filters recent conversations by title, record name, and record type', () => {
    const conversations = [
      {
        id: 'one',
        title: 'Weekly risk review',
        context: {
          ...PROJECT_CONTEXT,
          title: 'Hárbour Tower',
        },
      },
      {
        id: 'two',
        title: 'Collections',
        context: {
          ...PROJECT_CONTEXT,
          refTable: 'invoices',
          refId: '22222222-2222-4222-8222-222222222222',
          nodeType: 'invoice',
          title: 'INV-1042',
        },
      },
      {
        id: 'three',
        title: 'Company priorities',
        context: null,
      },
    ]

    expect(filterCortexConversations(conversations, 'risk harbour')).toEqual([
      conversations[0],
    ])
    expect(filterCortexConversations(conversations, 'invoice')).toEqual([
      conversations[1],
    ])
    expect(filterCortexConversations(conversations, 'company-wide')).toEqual([
      conversations[2],
    ])
    expect(filterCortexConversations(conversations, 'missing')).toEqual([])
    expect(filterCortexConversations(conversations, '   ')).toEqual(
      conversations
    )
  })
})
