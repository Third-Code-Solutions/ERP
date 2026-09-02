import { describe, expect, it } from 'vitest'
import { reconcileSavedLineIdentities } from './budget-workspace'

const CLIENT_KEY = '11111111-1111-4111-8111-111111111111'
const SERVER_ID = '22222222-2222-4222-8222-222222222222'
const COST_CODE_ID = '33333333-3333-4333-8333-333333333333'

describe('BudgetWorkspace saved-line reconciliation', () => {
  it('binds a newly inserted server identity to its stable client row key', () => {
    const reconciled = reconcileSavedLineIdentities(
      [
        {
          key: CLIENT_KEY,
          persistedId: null,
          costCodeId: COST_CODE_ID,
          bomLineItemId: '',
          description: 'New line',
          amountPhp: '125.00',
        },
      ],
      [{ id: SERVER_ID, clientKey: CLIENT_KEY }]
    )

    expect(reconciled).toEqual([
      {
        key: CLIENT_KEY,
        persistedId: SERVER_ID,
        costCodeId: COST_CODE_ID,
        bomLineItemId: '',
        description: 'New line',
        amountPhp: '125.00',
      },
    ])
  })

  it('does not attach an unbound returned identity to another editor row', () => {
    const reconciled = reconcileSavedLineIdentities(
      [
        {
          key: CLIENT_KEY,
          persistedId: null,
          costCodeId: COST_CODE_ID,
          bomLineItemId: '',
          description: 'New line',
          amountPhp: '125.00',
        },
      ],
      [{ id: SERVER_ID }]
    )

    expect(reconciled[0]?.persistedId).toBeNull()
  })
})
