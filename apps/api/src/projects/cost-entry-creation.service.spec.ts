import 'reflect-metadata'

import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CostEntryCreationService } from './cost-entry-creation.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}

const COMMAND = {
  costCodeId: '44444444-4444-4444-8444-444444444444',
  costCategory: 'material' as const,
  description: 'Concrete delivery',
  amountCents: 125_000,
  quantity: 1,
  unit: null,
  incurredAt: null,
  referenceNumber: null,
  notes: null,
}

const CREATED = {
  id: '55555555-5555-4555-8555-555555555555',
  tenant_id: PRINCIPAL.tenantId,
  project_id: '33333333-3333-4333-8333-333333333333',
  cost_code_id: COMMAND.costCodeId,
  created_by: PRINCIPAL.userId,
  cost_category: COMMAND.costCategory,
  cost_source: 'manual' as const,
  description: COMMAND.description,
  amount_cents: COMMAND.amountCents,
  quantity: COMMAND.quantity,
  unit: COMMAND.unit,
  incurred_at: new Date('2026-08-05T00:00:00.000Z'),
  reference_number: COMMAND.referenceNumber,
  notes: COMMAND.notes,
  created_at: new Date('2026-08-05T01:00:00.000Z'),
}

const REPLAY_RESULT = {
  id: CREATED.id,
  tenantId: CREATED.tenant_id,
  projectId: CREATED.project_id,
  costCodeId: CREATED.cost_code_id,
  costCategory: CREATED.cost_category,
  costSource: CREATED.cost_source,
  description: CREATED.description,
  amountCents: CREATED.amount_cents,
  quantity: CREATED.quantity,
  unit: CREATED.unit,
  incurredAt: CREATED.incurred_at.toISOString(),
  referenceNumber: CREATED.reference_number,
  notes: CREATED.notes,
  createdAt: CREATED.created_at.toISOString(),
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
      key === 'ERP_COST_ENTRY_CREATE_WRITES_ENABLED'
        ? true
        : [PRINCIPAL.tenantId]
    ),
  }
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  const service = new CostEntryCreationService(
    config as never,
    { client: { transaction } } as unknown as DatabaseService,
    audit as unknown as AuditService
  )
  return { service, transaction, audit }
}

describe('CostEntryCreationService', () => {
  it('fails closed before opening a transaction when the canary is disabled', async () => {
    const transaction = vi.fn()
    const service = new CostEntryCreationService(
      {
        get: vi.fn((key: string, fallback: unknown) => fallback),
      } as never,
      { client: { transaction } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(
      service.create(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'cost-create-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('denies a role without cost.record before claiming idempotency', async () => {
    const membershipQuery = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'viewer',
        email: 'viewer@example.test',
      },
    ])
    const transactionClient = {
      select: vi.fn().mockReturnValue({ from: membershipQuery.from }),
      insert: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.create(
        CREATED.project_id,
        COMMAND,
        PRINCIPAL,
        'cost-create-role-denied'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('denies a principal with no membership in the requested tenant', async () => {
    const membershipQuery = selectQuery([])
    const transactionClient = {
      select: vi.fn().mockReturnValue({ from: membershipQuery.from }),
      insert: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.create(
        CREATED.project_id,
        COMMAND,
        PRINCIPAL,
        'cost-create-cross-tenant'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('replays the exact result without inserting or writing a second audit row', async () => {
    const membershipQuery = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const request = {
      id: '66666666-6666-4666-8666-666666666666',
      requestHash: '',
      state: 'succeeded',
      result: REPLAY_RESULT,
    }
    const requestQuery = selectQuery([request])
    const insertRequestValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membershipQuery.from })
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi.fn().mockReturnValue({ values: insertRequestValues }),
    }
    const { service, transaction, audit } = enabledService(transactionClient)

    await expect(
      service.create(
        CREATED.project_id,
        COMMAND,
        PRINCIPAL,
        'cost-create-replay'
      )
    ).resolves.toEqual(REPLAY_RESULT)
    expect(transaction).toHaveBeenCalledOnce()
    expect(transactionClient.select).toHaveBeenCalledTimes(2)
    expect(transactionClient.insert).toHaveBeenCalledOnce()
    expect(audit.stampActor).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('audits only bounded financial identifiers and hash evidence', async () => {
    const membershipQuery = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const request = {
      id: '77777777-7777-4777-8777-777777777777',
      requestHash: '',
      state: 'processing',
      result: null,
    }
    const requestQuery = selectQuery([request])
    const projectQuery = selectQuery([{ id: CREATED.project_id }])
    const costCodeQuery = selectQuery([
      { id: CREATED.cost_code_id, category: COMMAND.costCategory, isActive: true },
    ])
    const insertRequestValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const insertEntryValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([CREATED]),
    })
    const updateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: request.id }]),
      }),
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membershipQuery.from })
        .mockReturnValueOnce({ from: requestQuery.from })
        .mockReturnValueOnce({ from: projectQuery.from })
        .mockReturnValueOnce({ from: costCodeQuery.from }),
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: insertRequestValues })
        .mockReturnValueOnce({ values: insertEntryValues }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    }
    const { service, audit } = enabledService(transactionClient)

    await service.create(
      CREATED.project_id,
      COMMAND,
      PRINCIPAL,
      'cost-create-audit'
    )

    expect(audit.writeSemantic).toHaveBeenCalledOnce()
    const auditInput = audit.writeSemantic.mock.calls[0]?.[1] as {
      diff: Record<string, unknown>
    }
    expect(auditInput.diff).toMatchObject({
      project_id: CREATED.project_id,
      cost_code_id: CREATED.cost_code_id,
      category: COMMAND.costCategory,
      amount_cents: COMMAND.amountCents,
    })
    expect(auditInput.diff.idempotency_key_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(auditInput.diff).not.toHaveProperty('description')
    expect(auditInput.diff).not.toHaveProperty('notes')
    expect(auditInput.diff).not.toHaveProperty('reference_number')
  })
})
