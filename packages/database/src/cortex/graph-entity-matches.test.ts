import { describe, expect, it } from 'vitest'
import { prioritizeCortexEntityMatches } from './graph'

describe('Cortex entity relationship selection', () => {
  it('places the matched account and its own opportunity before unrelated direct matches', () => {
    const account = { id: 'account', node_type: 'account' as const }
    const ownOpportunity = {
      id: 'own-opportunity',
      node_type: 'opportunity' as const,
    }
    const unrelatedOpportunity = {
      id: 'unrelated-opportunity',
      node_type: 'opportunity' as const,
    }
    const changeRequest = {
      id: 'change-request',
      node_type: 'change_request' as const,
    }
    const ambiguousAccount = {
      id: 'ambiguous-account',
      node_type: 'account' as const,
    }

    expect(
      prioritizeCortexEntityMatches(
        [changeRequest, unrelatedOpportunity, account, ambiguousAccount],
        [ownOpportunity],
        3,
        account.id
      ).map((node) => node.id)
    ).toEqual(['account', 'own-opportunity', 'ambiguous-account'])
  })
})
