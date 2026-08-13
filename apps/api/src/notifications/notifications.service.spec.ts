import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { NotificationsService } from './notifications.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const NOTIFICATION_ID = '33333333-3333-4333-8333-333333333333'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
}

const ROW = {
  id: NOTIFICATION_ID,
  subject: 'Project update',
  body: 'A project changed state.',
  linkUrl: '/projects/44444444-4444-4444-8444-444444444444',
  channel: 'in_app' as const,
  isRead: false,
  createdAt: new Date('2026-08-10T04:00:00.000Z'),
}

function selectChain<T>(result: T, whereCalls: ReturnType<typeof vi.fn>) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.from = vi.fn().mockReturnValue(query)
  query.where = vi.fn((...args: unknown[]) => {
    whereCalls(...args)
    return query
  })
  query.orderBy = vi.fn().mockReturnValue(query)
  query.limit = vi.fn().mockReturnValue(query)
  query.then = vi.fn((resolve: (value: T) => unknown) =>
    Promise.resolve(result).then(resolve)
  )
  return query
}

function updateChain(
  result: unknown[],
  whereCalls: ReturnType<typeof vi.fn>
) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.set = vi.fn().mockReturnValue(query)
  query.where = vi.fn((...args: unknown[]) => {
    whereCalls(...args)
    return query
  })
  query.returning = vi.fn().mockResolvedValue(result)
  return query
}

function enabledHarness() {
  const whereCalls = vi.fn()
  const select = vi.fn().mockReturnValue(selectChain([ROW], whereCalls))
  const update = vi
    .fn()
    .mockReturnValue(updateChain([{ id: NOTIFICATION_ID }], whereCalls))
  const transaction = {
    update,
  }
  const database = {
    client: {
      select,
      transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction)
      ),
    },
  } as unknown as DatabaseService
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_NOTIFICATION_READ_STATE_ENABLED') return true
      if (key === 'ERP_NOTIFICATION_READ_STATE_TENANT_IDS') return [TENANT_ID]
      return fallback
    }),
  } as unknown as ConfigService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  return {
    service: new NotificationsService(config, database, audit),
    select,
    update,
    whereCalls,
    audit,
  }
}

describe('NotificationsService', () => {
  it('fails closed before reading or updating the database', async () => {
    const select = vi.fn()
    const transaction = vi.fn()
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService
    const database = {
      client: { select, transaction },
    } as unknown as DatabaseService
    const audit = {
      stampActor: vi.fn(),
      writeSemantic: vi.fn(),
    } as unknown as AuditService
    const service = new NotificationsService(config, database, audit)

    await expect(service.list(PRINCIPAL)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    await expect(
      service.markReadState(
        { action: 'mark_read', id: NOTIFICATION_ID },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(select).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('lists only tenant/user notifications with a bounded result', async () => {
    const probe = enabledHarness()
    await expect(probe.service.list(PRINCIPAL)).resolves.toMatchObject({
      unread: 1,
      items: [expect.objectContaining({ id: NOTIFICATION_ID })],
    })
    const querySql = new PgDialect().sqlToQuery(
      probe.whereCalls.mock.calls[0]?.[0]
    )
    expect(querySql.params).toContain(TENANT_ID)
    expect(querySql.params).toContain(USER_ID)
  })

  it('audits a user-scoped read-state update without leaking cross-tenant rows', async () => {
    const probe = enabledHarness()
    await expect(
      probe.service.markReadState(
        { action: 'mark_read', id: NOTIFICATION_ID },
        PRINCIPAL
      )
    ).resolves.toEqual({ ok: true })
    expect(probe.update).toHaveBeenCalledTimes(1)
    expect(probe.audit.stampActor).toHaveBeenCalledOnce()
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'notification',
        entityId: NOTIFICATION_ID,
        diff: { operation: 'mark_read' },
      })
    )
    const querySql = new PgDialect().sqlToQuery(
      probe.whereCalls.mock.calls[0]?.[0]
    )
    expect(querySql.params).toContain(TENANT_ID)
    expect(querySql.params).toContain(USER_ID)
    expect(querySql.params).toContain(NOTIFICATION_ID)
  })
})
