import type { Database } from '@third-code-erp/database'
import { describe, expect, it, vi } from 'vitest'
import { writeAwardAuditInTransaction } from './audit'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

describe('award semantic audit', () => {
  it('serializes the tenant chain and inserts a linked hash in the caller transaction', async () => {
    const execute = vi.fn().mockResolvedValue([])
    const limit = vi.fn().mockResolvedValue([{ hash: 'prior-hash' }])
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const values = vi.fn().mockResolvedValue(undefined)
    const insert = vi.fn().mockReturnValue({ values })
    // The semantic audit writer uses only these transaction methods.
    const tx = { execute, select, insert } as unknown as DatabaseTransaction

    await writeAwardAuditInTransaction(tx, {
      tenantId: '22222222-2222-4222-8222-222222222222',
      actorId: null,
      entityType: 'award_handoff',
      entityId: '33333333-3333-4333-8333-333333333333',
      action: 'create',
      diff: { source_bom_id: '44444444-4444-4444-8444-444444444444' },
    })

    expect(execute).toHaveBeenCalledOnce()
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      prev_hash: 'prior-hash',
      actor_id: null,
      entity_type: 'award_handoff',
      action: 'create',
      hash: expect.any(String),
    }))
  })
})
