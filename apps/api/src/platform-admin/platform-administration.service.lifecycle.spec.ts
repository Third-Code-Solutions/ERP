import { describe, expect, it, vi } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { PlatformAdministrationService } from './platform-administration.service'
import { PlatformIdentityAdminService } from './platform-identity-admin.service'
import { PLATFORM_OWNER_EMAIL, type PlatformPrincipal } from '../auth/platform-owner.guard'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const TARGET_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ADMIN_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '44444444-4444-4444-8444-444444444444'
const SUPPORT_SESSION_ID = '55555555-5555-4555-8555-555555555555'

const PRINCIPAL: PlatformPrincipal = {
  userId: OWNER_ID,
  email: PLATFORM_OWNER_EMAIL,
  traceId: '66666666-6666-4666-8666-666666666666',
  supportSessionId: SUPPORT_SESSION_ID,
}

type Row = Record<string, unknown>

function query(rows: Row[]) {
  const promise = Promise.resolve(rows)
  const builder = {
    from: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    for: vi.fn(() => builder),
    then: promise.then.bind(promise),
  }
  return builder
}

function transactionClient(rows: Row[][], auditFailure: boolean) {
  const selectRows = [...rows]
  let selectIndex = 0
  const select = vi.fn(() => query(selectRows[selectIndex++] ?? []))
  const tx = {
    select,
    execute: vi.fn().mockResolvedValue([]),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: TARGET_ID, tenantId: TENANT_ID }]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => {
        if (auditFailure) throw new Error('synthetic audit failure')
      }),
    })),
  }
  return tx
}

describe('PlatformAdministrationService lifecycle compensation', () => {
  it('reconciles Auth to a newer committed durable status after rollback', async () => {
    let transactionCount = 0
    let committedStatus: 'active' | 'suspended' = 'active'
    const identity = { setSuspended: vi.fn().mockResolvedValue(undefined) }
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      transactionCount += 1
      const first = transactionCount === 1
      const rows = first
        ? [
            [{ userId: OWNER_ID }],
            [{ tenantId: TENANT_ID }],
            [{ id: SUPPORT_SESSION_ID }],
            [{ id: TARGET_ID, tenantId: TENANT_ID, role: 'viewer', accountStatus: 'active' }],
            [],
            [
              { id: TARGET_ID, role: 'viewer', accountStatus: 'active' },
              { id: OTHER_ADMIN_ID, role: 'admin', accountStatus: 'active' },
            ],
          ]
        : [
            [{ userId: OWNER_ID }],
            [{ tenantId: TENANT_ID }],
            [{ accountStatus: committedStatus }],
          ]
      try {
        return await callback(transactionClient(rows, first))
      } catch (error) {
        if (first) committedStatus = 'suspended'
        throw error
      }
    })
    const service = new PlatformAdministrationService(
      new ConfigService({}),
      { client: { transaction } } as unknown as DatabaseService,
      identity as unknown as PlatformIdentityAdminService,
    )

    await expect(
      service.updateUserStatus(TARGET_ID, { status: 'suspended', reason: 'Retain history' }, PRINCIPAL),
    ).rejects.toThrow('synthetic audit failure')

    expect(identity.setSuspended).toHaveBeenNthCalledWith(1, TARGET_ID, true)
    expect(identity.setSuspended).toHaveBeenNthCalledWith(2, TARGET_ID, true)
    expect(transaction).toHaveBeenCalledTimes(2)
  })
})
