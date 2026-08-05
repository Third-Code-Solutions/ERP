import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { DatabaseService } from '../database/database.service'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditActivityService } from './audit-activity.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
  role: 'admin',
  email: 'admin@example.test',
}

function databaseWithRows(rows: unknown[], total = 1) {
  const offset = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ offset })
  const orderBy = vi.fn().mockReturnValue({ limit })
  const where = vi.fn().mockReturnValue({ orderBy })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi
    .fn()
    .mockReturnValueOnce({ from })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total }]),
      }),
    })
  return {
    database: { client: { select } } as unknown as DatabaseService,
    select,
    where,
  }
}

describe('AuditActivityService', () => {
  it('returns a bounded, redacted tenant-scoped activity page', async () => {
    const probe = databaseWithRows([
      {
        id: '42',
        tenant_id: TENANT_ID,
        actor_id: PRINCIPAL.userId,
        entity_type: 'project',
        entity_id: '33333333-3333-4333-8333-333333333333',
        action: 'create',
        prev_hash: 'genesis',
        hash: 'a'.repeat(64),
        created_at: new Date('2026-08-05T00:00:00.000Z'),
      },
    ])
    const service = new AuditActivityService(probe.database)

    const result = await service.list(
      {
        entityType: 'project',
        entityIds: ['33333333-3333-4333-8333-333333333333'],
        page: 2,
        limit: 10,
      },
      PRINCIPAL
    )

    expect(result.rows[0]).toEqual({
      id: '42',
      tenantId: TENANT_ID,
      actorId: PRINCIPAL.userId,
      entityType: 'project',
      entityId: '33333333-3333-4333-8333-333333333333',
      action: 'create',
      prevHash: 'genesis',
      hash: 'a'.repeat(64),
      createdAt: '2026-08-05T00:00:00.000Z',
    })
    expect(result.total).toBe(1)

    const whereSql = new PgDialect().sqlToQuery(probe.where.mock.calls[0]?.[0])
    expect(whereSql.sql).toContain('"audit_log"."tenant_id" = $1')
    expect(whereSql.params).toContain(TENANT_ID)
    expect(whereSql.params).toContain('33333333-3333-4333-8333-333333333333')
    expect(result.rows[0]).not.toHaveProperty('diff')
  })
})
