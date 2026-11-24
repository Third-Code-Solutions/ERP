import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}))

import { revokeOpenSigningSessions } from './signing-sessions'

const executor = { update: mocks.update } as unknown as Parameters<typeof revokeOpenSigningSessions>[0]

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ENTITY_ID = '22222222-2222-4222-8222-222222222222'

function renderedWhere() {
  return new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0])
}

describe('revokeOpenSigningSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.set.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue(undefined)
  })

  it('stamps revoked_at only on unsigned, unrevoked sessions of one tenant entity', async () => {
    await revokeOpenSigningSessions(executor, TENANT_ID, 'coc', ENTITY_ID)

    expect(mocks.set).toHaveBeenCalledWith({ revoked_at: expect.any(Date) })
    const query = renderedWhere()
    for (const column of ['tenant_id', 'entity_type', 'entity_id']) {
      expect(query.sql).toContain(`"${column}" = $`)
    }
    expect(query.sql).toContain('"signed_at" is null')
    expect(query.sql).toContain('"revoked_at" is null')
    expect(query.sql).not.toContain('token_hash')
    expect(query.params).toEqual(
      expect.arrayContaining([TENANT_ID, 'coc', ENTITY_ID])
    )
  })

  it('spares the freshly issued link by token hash', async () => {
    await revokeOpenSigningSessions(executor, TENANT_ID, 'coc', ENTITY_ID, 'a'.repeat(64))

    const query = renderedWhere()
    expect(query.sql).toContain('"token_hash" <> $')
    // Only the hash of the new link is sent to the database, never the token.
    expect(query.params).not.toContain('a'.repeat(64))
  })
})
