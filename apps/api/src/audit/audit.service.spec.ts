import 'reflect-metadata'

import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseTransaction } from '../database/database.service'
import { AuditService } from './audit.service'

describe('AuditService nonblocking tenant-chain admission', () => {
  it.each([true, false])('returns PostgreSQL admission result %s using the canonical audit key', async (acquired) => {
    const execute = vi.fn().mockResolvedValue([{ acquired }])
    // Only SQL execution is replaced; query compilation verifies the lock identity.
    const transaction = { execute } as unknown as DatabaseTransaction
    expect(await new AuditService().tryLockTenantChain(transaction, 'tenant-test')).toBe(acquired)
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0])
    expect(query.sql).toContain('pg_try_advisory_xact_lock')
    expect(query.sql).toContain('hashtextextended')
    expect(query.params).toEqual(['audit_log:tenant-test'])
  })
})
