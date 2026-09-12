import 'reflect-metadata'

import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { UserRoleAssignmentService } from './user-role-assignment.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
  email: 'admin@example.test',
}
const TARGET_ID = '33333333-3333-4333-8333-333333333333'
const UPDATED_AT = new Date('2026-08-07T00:00:00.000Z')

function selectQuery(rows: unknown[]) {
  const rowLock = vi.fn().mockResolvedValue(rows.map(row =>
    row && typeof row === 'object' && 'email' in row
      ? { accountStatus: 'active', ...row } : row,
  ))
  const limit = vi.fn().mockReturnValue({ for: rowLock })
  const where = vi.fn().mockReturnValue({ limit, for: rowLock })
  const from = vi.fn().mockReturnValue({ where })
  return { from, rowLock }
}

function enabledService(
  transactionClient: Record<string, unknown>,
  actorRole: ErpPrincipal['role'] = PRINCIPAL.role,
  audit = { stampActor: vi.fn(), writeSemantic: vi.fn(), tryLockTenantChain: vi.fn().mockResolvedValue(true) }
) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED'
        ? true
        : [PRINCIPAL.tenantId]
    ),
  }
  const execute = vi.fn().mockResolvedValue([])
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ execute, ...transactionClient })
  )
  const service = new UserRoleAssignmentService(
    config as never,
    { client: { transaction } } as unknown as DatabaseService,
    audit as unknown as AuditService
  )
  return {
    service,
    transaction,
    execute,
    audit,
    principal: { ...PRINCIPAL, role: actorRole },
  }
}

function processingRequest() {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    requestHash: '',
    state: 'processing' as const,
    result: null,
  }
}

function requestInsert(request: ReturnType<typeof processingRequest>) {
  return vi.fn().mockImplementation((values) => {
    request.requestHash = values.request_hash
    return { onConflictDoNothing: vi.fn() }
  })
}

describe('UserRoleAssignmentService', () => {
  describe.each(['55P03', '40P01'])('PostgreSQL %s', (code) => {
  it.each(['actor', 'tenant', 'target'] as const)('maps nested lock conflict at the %s admission to a retryable conflict', async (stage) => {
    const actor = selectQuery([{ tenantId: PRINCIPAL.tenantId, role: 'admin', email: PRINCIPAL.email }])
    const tenant = selectQuery([{ status: 'active' }])
    const target = selectQuery([])
    const request = processingRequest()
    const admissions = { actor, tenant, target }
    admissions[stage].rowLock.mockRejectedValue({ cause: { cause: { code } } })
    const transactionClient = {
      select: vi.fn().mockReturnValueOnce(actor).mockReturnValueOnce(tenant)
        .mockReturnValueOnce(selectQuery([request])).mockReturnValueOnce(target),
      insert: vi.fn().mockReturnValue({ values: requestInsert(request) }),
      update: vi.fn(),
    }
    const { service, audit, execute } = enabledService(transactionClient)
    await expect(service.assign(TARGET_ID, { expectedRole: 'viewer', role: 'pm' }, PRINCIPAL, 'busy'))
      .rejects.toThrow('Retry with the same request ID')
    expect(admissions[stage].rowLock).toHaveBeenCalledWith(stage === 'tenant' ? 'share' : 'update', { noWait: true })
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
    expect(new PgDialect().sqlToQuery(execute.mock.calls[0]![0]).sql).toBe("select set_config('lock_timeout', '1s', true)")
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(actor.rowLock.mock.invocationCallOrder[0]!)
    if (stage === 'target') {
      expect(audit.tryLockTenantChain.mock.invocationCallOrder[0]).toBeLessThan(transactionClient.insert.mock.invocationCallOrder[0]!)
    } else {
      expect(transactionClient.insert).not.toHaveBeenCalled()
    }
  })

  })

  it('rejects busy audit admission before creating an idempotency row', async () => {
    const transactionClient = {
      select: vi.fn().mockReturnValueOnce(selectQuery([{ tenantId: PRINCIPAL.tenantId, role: 'admin', email: PRINCIPAL.email }]))
        .mockReturnValueOnce(selectQuery([{ status: 'active' }])),
      insert: vi.fn(), update: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)
    audit.tryLockTenantChain.mockResolvedValue(false)
    await expect(service.assign(TARGET_ID, { expectedRole: 'viewer', role: 'pm' }, PRINCIPAL, 'audit-busy'))
      .rejects.toBeInstanceOf(ConflictException)
    expect(audit.tryLockTenantChain).toHaveBeenCalledWith(expect.anything(), PRINCIPAL.tenantId)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('does not disguise unrelated database failures as contention', async () => {
    const failure = { cause: { code: '23505' } }
    const actor = selectQuery([])
    actor.rowLock.mockRejectedValue(failure)
    const { service } = enabledService({ select: vi.fn().mockReturnValue(actor) })
    await expect(service.assign(TARGET_ID, { expectedRole: 'viewer', role: 'pm' }, PRINCIPAL, 'failure')).rejects.toBe(failure)
  })

  it.each([
    { accountStatus: 'suspended', tenantStatus: 'active' },
    { accountStatus: 'disabled', tenantStatus: 'active' },
    { accountStatus: 'invited', tenantStatus: 'active' },
    { accountStatus: 'active', tenantStatus: 'suspended' },
    { accountStatus: 'active', tenantStatus: 'disabled' },
  ])('rejects current actor $accountStatus / tenant $tenantStatus before idempotency, despite an earlier allowed principal', async (status) => {
    const membership = selectQuery([{
      tenantId: PRINCIPAL.tenantId,
      role: 'admin',
      email: PRINCIPAL.email,
      ...status,
    }])
    // A valid completed request makes the old service resolve successfully.
    // Authorization must still be current even when replaying an old result.
    const request = {
      id: '44444444-4444-4444-8444-444444444444',
      requestHash: '',
      state: 'succeeded',
      result: {
        userId: TARGET_ID, tenantId: PRINCIPAL.tenantId,
        previousRole: 'viewer', role: 'pm', status: 'updated',
        updatedAt: UPDATED_AT.toISOString(),
      },
    }
    const requestQuery = selectQuery([request])
    const transactionClient = {
      select: vi.fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce(selectQuery([{ status: status.tenantStatus }]))
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn((values: { request_hash: string }) => {
          request.requestHash = values.request_hash
          return { onConflictDoNothing: vi.fn() }
        }),
      }),
      update: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)
    await expect(service.assign(
      TARGET_ID, { expectedRole: 'viewer', role: 'pm' }, PRINCIPAL, 'role-inactive',
    )).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('fails closed before opening a transaction when disabled', async () => {
    const transaction = vi.fn()
    const service = new UserRoleAssignmentService(
      { get: vi.fn((_key: string, fallback: unknown) => fallback) } as never,
      { client: { transaction } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(
      service.assign(
        TARGET_ID,
        { expectedRole: 'viewer', role: 'pm' },
        PRINCIPAL,
        'role-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('denies a locked actor without admin.users before idempotency', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'viewer',
        email: 'viewer@example.test',
      },
    ])
    const transactionClient = {
      select: vi.fn().mockReturnValue({ from: membership.from }),
      insert: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.assign(
        TARGET_ID,
        { expectedRole: 'viewer', role: 'pm' },
        PRINCIPAL,
        'role-denied'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('denies admins assigning owner or changing an owner', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'admin',
        email: PRINCIPAL.email,
      },
    ])
    const request = processingRequest()
    const requestQuery = selectQuery([request])
    const target = selectQuery([
      {
        id: TARGET_ID,
        tenantId: PRINCIPAL.tenantId,
        role: 'viewer',
        updatedAt: UPDATED_AT,
      },
    ])
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce(selectQuery([{ status: 'active' }]))
        .mockReturnValueOnce({ from: requestQuery.from })
        .mockReturnValueOnce({ from: target.from }),
      insert: vi.fn().mockReturnValue({ values: requestInsert(request) }),
      update: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.assign(
        TARGET_ID,
        { expectedRole: 'viewer', role: 'owner' },
        PRINCIPAL,
        'role-owner-denied'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects stale expected roles without mutation', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'admin',
        email: PRINCIPAL.email,
      },
    ])
    const request = processingRequest()
    const requestQuery = selectQuery([request])
    const target = selectQuery([
      {
        id: TARGET_ID,
        tenantId: PRINCIPAL.tenantId,
        role: 'pm',
        updatedAt: UPDATED_AT,
      },
    ])
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce(selectQuery([{ status: 'active' }]))
        .mockReturnValueOnce({ from: requestQuery.from })
        .mockReturnValueOnce({ from: target.from }),
      insert: vi.fn().mockReturnValue({ values: requestInsert(request) }),
      update: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.assign(
        TARGET_ID,
        { expectedRole: 'viewer', role: 'finance' },
        PRINCIPAL,
        'role-stale'
      )
    ).rejects.toBeInstanceOf(ConflictException)
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('prevents an owner from removing their own owner role', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'owner',
        email: PRINCIPAL.email,
      },
    ])
    const request = processingRequest()
    const requestQuery = selectQuery([request])
    const target = selectQuery([
      {
        id: PRINCIPAL.userId,
        tenantId: PRINCIPAL.tenantId,
        role: 'owner',
        updatedAt: UPDATED_AT,
      },
    ])
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce(selectQuery([{ status: 'active' }]))
        .mockReturnValueOnce({ from: requestQuery.from })
        .mockReturnValueOnce({ from: target.from }),
      insert: vi.fn().mockReturnValue({ values: requestInsert(request) }),
      update: vi.fn(),
    }
    const { service, audit, principal } = enabledService(
      transactionClient,
      'owner'
    )

    await expect(
      service.assign(
        PRINCIPAL.userId,
        { expectedRole: 'owner', role: 'admin' },
        principal,
        'role-owner-self-demotion'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('replays the stored result without another update or audit', async () => {
    const result = {
      userId: TARGET_ID,
      tenantId: PRINCIPAL.tenantId,
      previousRole: 'viewer' as const,
      role: 'pm' as const,
      status: 'updated' as const,
      updatedAt: UPDATED_AT.toISOString(),
    }
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'admin',
        email: PRINCIPAL.email,
      },
    ])
    const request = {
      ...processingRequest(),
      state: 'succeeded' as const,
      result,
    }
    const requestQuery = selectQuery([request])
    const insertValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce(selectQuery([{ status: 'active' }]))
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.assign(
        TARGET_ID,
        { expectedRole: 'viewer', role: 'pm' },
        PRINCIPAL,
        'role-replay'
      )
    ).resolves.toEqual(result)
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('updates and audits one owner-authorized command atomically', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'owner',
        email: PRINCIPAL.email,
      },
    ])
    const request = processingRequest()
    const requestQuery = selectQuery([request])
    const target = selectQuery([
      {
        id: TARGET_ID,
        tenantId: PRINCIPAL.tenantId,
        role: 'viewer',
        updatedAt: UPDATED_AT,
      },
    ])
    const changedAt = new Date('2026-08-07T01:00:00.000Z')
    const userUpdateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: TARGET_ID,
            tenantId: PRINCIPAL.tenantId,
            role: 'owner',
            updatedAt: changedAt,
          },
        ]),
      }),
    })
    const requestUpdateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: request.id }]),
      }),
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce(selectQuery([{ status: 'active' }]))
        .mockReturnValueOnce({ from: requestQuery.from })
        .mockReturnValueOnce({ from: target.from }),
      insert: vi.fn().mockReturnValue({ values: requestInsert(request) }),
      update: vi
        .fn()
        .mockReturnValueOnce({ set: userUpdateSet })
        .mockReturnValueOnce({ set: requestUpdateSet }),
    }
    const { service, audit, principal } = enabledService(
      transactionClient,
      'owner'
    )

    await expect(
      service.assign(
        TARGET_ID,
        { expectedRole: 'viewer', role: 'owner' },
        principal,
        'role-success'
      )
    ).resolves.toMatchObject({
      userId: TARGET_ID,
      previousRole: 'viewer',
      role: 'owner',
      status: 'updated',
    })
    expect(audit.writeSemantic).toHaveBeenCalledOnce()
    expect(audit.writeSemantic.mock.calls[0]?.[1]).toMatchObject({
      tenantId: PRINCIPAL.tenantId,
      entityType: 'user',
      entityId: TARGET_ID,
      action: 'update',
      diff: {
        role: { before: 'viewer', after: 'owner' },
        status: 'updated',
        idempotency_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    })
  })
})
