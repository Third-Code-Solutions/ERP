import { describe, expect, it } from 'vitest'
import { validateBudgetDraftReceipt } from './budget-draft-receipts'

const projectId = '11111111-1111-4111-8111-111111111111'
const budgetId = '22222222-2222-4222-8222-222222222222'
const requestId = '33333333-3333-4333-8333-333333333333'
const receiptScope = { operation: 'save_draft' as const, projectId, sourceBudgetId: budgetId, requestId, expectedVersion: '123:1789320000.123456' }
const command = { ...receiptScope, lineBindings: [] }
const receipt = { ...receiptScope, resultId: budgetId, resultVersion: '124:1789320001.654321', lines: [] }

describe('draft command receipt binding', () => {
  it('accepts an exact saved receipt without truncating its version', () => {
    expect(validateBudgetDraftReceipt({ ok: true, id: budgetId, receipt, lines: [] }, command)).toEqual(receipt)
  })
  it.each([
    { requestId: projectId }, { projectId: budgetId }, { sourceBudgetId: projectId },
    { expectedVersion: '123:1789320000.123' }, { resultVersion: 'invalid' },
    { operation: 'create_budget' }, { resultId: requestId }, { lines: [{ id: 'invalid' }] },
  ])('rejects a mismatched or malformed saved receipt: %j', patch => {
    expect(validateBudgetDraftReceipt({ ok: true, id: budgetId, receipt: { ...receipt, ...patch }, lines: [] }, command)).toBeNull()
  })
  it('rejects contradictory top-level line mappings', () => {
    expect(validateBudgetDraftReceipt({ ok: true, id: budgetId, receipt, lines: [{ id: projectId, costCodeId: requestId }] }, command)).toBeNull()
  })
  it('rejects a valid-looking receipt missing the requested line mapping', () => {
    expect(validateBudgetDraftReceipt({ ok: true, id: budgetId, receipt, lines: [] }, {
      ...command, lineBindings: [{ id: projectId, clientKey: projectId, costCodeId: requestId }],
    })).toBeNull()
  })
})
