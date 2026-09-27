import { describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  runSignedBomAward: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { transaction: mock.transaction },
}))
vi.mock('@third-code-erp/operations/signed-bom-award', () => ({
  runSignedBomAward: mock.runSignedBomAward,
  selectSignedBomAwardLines: vi.fn(),
}))

import { runSignedBomAwardInTransaction } from './award-automation'

describe('Web signed-BOM award adapter', () => {
  it('delegates to the shared award operation in its own transaction', async () => {
    const args = {
      tenantId: '22222222-2222-4222-8222-222222222222',
      bomId: '33333333-3333-4333-8333-333333333333',
      actorId: null,
    }
    const tx = { id: 'caller-owned-transaction' }
    const result = { handoffId: 'shared-handoff' }
    mock.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx)
    )
    mock.runSignedBomAward.mockResolvedValue(result)

    await expect(runSignedBomAwardInTransaction(args)).resolves.toBe(result)
    expect(mock.runSignedBomAward).toHaveBeenCalledWith(tx, args)
    expect(mock.transaction).toHaveBeenCalledOnce()
  })
})
