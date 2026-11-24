import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  select: vi.fn(),
  selectWhere: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}))

import { newestOpenSigningSessionAt, revokeOpenSigningSessions } from './signing-sessions'

const executor = { update: mocks.update } as unknown as Parameters<typeof revokeOpenSigningSessions>[0]

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ENTITY_ID = '22222222-2222-4222-8222-222222222222'

function renderedWhere() {
  return new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0])
}

describe('newestOpenSigningSessionAt', () => {
  const reader = { select: mocks.select } as unknown as Parameters<typeof newestOpenSigningSessionAt>[0]

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: () => ({ where: mocks.selectWhere }) })
    mocks.selectWhere.mockReturnValue({ orderBy: mocks.orderBy })
    mocks.orderBy.mockReturnValue({ limit: mocks.limit })
  })

  it('reads the newest unsigned, unrevoked link of one tenant entity', async () => {
    const createdAt = new Date('2026-11-24T09:00:00.000Z')
    mocks.limit.mockResolvedValue([{ createdAt }])

    await expect(newestOpenSigningSessionAt(reader, TENANT_ID, 'coc', ENTITY_ID)).resolves.toBe(createdAt)

    const query = new PgDialect().sqlToQuery(mocks.selectWhere.mock.calls[0]?.[0])
    expect(query.sql).toBe(
      '("signature_sessions"."tenant_id" = $1 and "signature_sessions"."entity_type" = $2 and "signature_sessions"."entity_id" = $3 and "signature_sessions"."signed_at" is null and "signature_sessions"."revoked_at" is null)'
    )
    expect(query.params).toEqual([TENANT_ID, 'coc', ENTITY_ID])
    expect(new PgDialect().sqlToQuery(mocks.orderBy.mock.calls[0]?.[0]).sql).toBe(
      '"signature_sessions"."created_at" desc'
    )
    expect(mocks.limit).toHaveBeenCalledWith(1)
  })

  it('is null when the entity has no open link', async () => {
    mocks.limit.mockResolvedValue([])

    await expect(newestOpenSigningSessionAt(reader, TENANT_ID, 'coc', ENTITY_ID)).resolves.toBeNull()
  })
})

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
