import 'reflect-metadata'

import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
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
  const rowLock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: rowLock })
  const where = vi.fn().mockReturnValue({ limit, for: rowLock })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

function enabledService(
  transactionClient: Record<string, unknown>,
  actorRole: ErpPrincipal['role'] = PRINCIPAL.role,
  audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED'
        ? true
        : [PRINCIPAL.tenantId]
    ),
  }
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  const service = new UserRoleAssignmentService(
    config as never,
    { client: { transaction } } as unknown as DatabaseService,
    audit as unknown as AuditService
  )
  return {
    service,
    transaction,
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
