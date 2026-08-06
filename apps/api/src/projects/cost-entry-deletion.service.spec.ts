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
import { CostEntryDeletionService } from './cost-entry-deletion.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '55555555-5555-4555-8555-555555555555'

const ENTRY = {
  id: ENTRY_ID,
  tenantId: PRINCIPAL.tenantId,
  projectId: PROJECT_ID,
  costSource: 'manual' as const,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
}

const VOIDED = {
  id: ENTRY_ID,
  tenantId: PRINCIPAL.tenantId,
  projectId: PROJECT_ID,
  costSource: 'manual' as const,
  voidedAt: new Date('2026-08-07T00:00:00.000Z'),
}

const RESULT = {
  costEntryId: ENTRY_ID,
  tenantId: PRINCIPAL.tenantId,
  projectId: PROJECT_ID,
  costSource: 'manual' as const,
  status: 'voided' as const,
  voidedAt: VOIDED.voidedAt.toISOString(),
  restorable: true as const,
}

function selectQuery(rows: unknown[]) {
  const rowLock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: rowLock })
  const where = vi.fn().mockReturnValue({ limit, for: rowLock })
  const from = vi.fn().mockReturnValue({ where })
  return { from, where, limit, rowLock }
}

function enabledService(
  transactionClient: Record<string, unknown>,
  audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_COST_ENTRY_DELETE_WRITES_ENABLED'
        ? true
        : [PRINCIPAL.tenantId]
    ),
  }
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  const service = new CostEntryDeletionService(
    config as never,
    { client: { transaction } } as unknown as DatabaseService,
    audit as unknown as AuditService
  )
  return { service, transaction, audit }
}

function command(reason = 'Duplicate manual entry') {
  return [PROJECT_ID, ENTRY_ID, reason, PRINCIPAL, 'cost-delete-1'] as const
}

describe('CostEntryDeletionService', () => {
  it('fails closed before opening a transaction when disabled', async () => {
    const transaction = vi.fn()
    const service = new CostEntryDeletionService(
      { get: vi.fn((_key: string, fallback: unknown) => fallback) } as never,
      { client: { transaction } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(service.delete(...command())).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(transaction).not.toHaveBeenCalled()
  })

  it('denies a role without cost.record before claiming idempotency', async () => {
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

    await expect(service.delete(...command())).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('replays the committed result without a second void or semantic audit', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const request = {
      id: '66666666-6666-4666-8666-666666666666',
      projectId: PROJECT_ID,
      costEntryId: ENTRY_ID,
      requestHash: '',
      state: 'succeeded',
      result: RESULT,
      snapshot: { costEntryId: ENTRY_ID },
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
    const { service, transaction, audit } = enabledService(transactionClient)

    await expect(service.delete(...command())).resolves.toEqual(RESULT)
    expect(transaction).toHaveBeenCalledOnce()
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('voids only a manual entry, audits bounded evidence, and stores restore state', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const request = {
      id: '77777777-7777-4777-8777-777777777777',
      projectId: PROJECT_ID,
      costEntryId: ENTRY_ID,
      requestHash: '',
      state: 'processing',
      result: null,
      snapshot: null,
    }
    const requestQuery = selectQuery([request])
    const entryQuery = selectQuery([ENTRY])
    const insertValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const voidUpdate = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([VOIDED]),
      }),
    })
    const completeUpdate = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: request.id }]),
      }),
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce({ from: requestQuery.from })
        .mockReturnValueOnce({ from: entryQuery.from }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: vi
        .fn()
        .mockReturnValueOnce({ set: voidUpdate })
        .mockReturnValueOnce({ set: completeUpdate }),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(service.delete(...command())).resolves.toEqual(RESULT)
    expect(voidUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        voided_by: PRINCIPAL.userId,
        void_reason: 'Duplicate manual entry',
      })
    )
    expect(completeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'succeeded',
        result: RESULT,
        snapshot: expect.objectContaining({
          costEntryId: ENTRY_ID,
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
        }),
      })
    )
    expect(audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'delete',
        diff: expect.objectContaining({
          status: 'voided',
          restorable: true,
          reason_length: 'Duplicate manual entry'.length,
        }),
      })
    )
  })

  it('rejects already managed source rows without mutating them', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const request = {
      id: '88888888-8888-4888-8888-888888888888',
      projectId: PROJECT_ID,
      costEntryId: ENTRY_ID,
      requestHash: '',
      state: 'processing',
      result: null,
      snapshot: null,
    }
    const requestQuery = selectQuery([request])
    const entryQuery = selectQuery([{ ...ENTRY, costSource: 'po_derived' }])
    const insertValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce({ from: requestQuery.from })
        .mockReturnValueOnce({ from: entryQuery.from }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: vi.fn(),
    }
    const { service } = enabledService(transactionClient)

    await expect(service.delete(...command())).rejects.toBeInstanceOf(
      ConflictException
    )
    expect(transactionClient.update).not.toHaveBeenCalled()
  })
})
