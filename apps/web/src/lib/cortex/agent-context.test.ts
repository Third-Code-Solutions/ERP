import { describe, expect, it } from 'vitest'
import {
  cortexAgentContextsMatch,
  cortexAgentContextHref,
  cortexAgentContextLabel,
  type CortexAgentContext,
} from './agent-context'

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
    expect(cortexAgentContextHref(null)).toBe('/cortex')
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
})
