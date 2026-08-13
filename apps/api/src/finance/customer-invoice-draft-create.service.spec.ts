import 'reflect-metadata'

import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CustomerInvoiceDraftCreateService } from './customer-invoice-draft-create.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const COMMAND = {
  billingPercentBps: 2500,
  bomId: null,
  dueDate: '2026-08-15',
  notes: 'Progress billing',
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
      key === 'ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED'
        ? true
        : [PRINCIPAL.tenantId]
    ),
  }
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  const service = new CustomerInvoiceDraftCreateService(
    config as never,
    { client: { transaction } } as unknown as DatabaseService,
    audit as unknown as AuditService
  )
  return { service, transaction, audit }
}

describe('CustomerInvoiceDraftCreateService', () => {
  it('fails closed before opening a transaction when the canary is disabled', async () => {
    const transaction = vi.fn()
    const service = new CustomerInvoiceDraftCreateService(
      {
        get: vi.fn((_key: string, fallback: unknown) => fallback),
      } as never,
      { client: { transaction } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(
      service.create(PROJECT_ID, COMMAND, PRINCIPAL, 'invoice-draft-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('denies a role without finance invoice capability before claiming idempotency', async () => {
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
      service.create(PROJECT_ID, COMMAND, PRINCIPAL, 'invoice-draft-role')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('replays an exact succeeded result without creating another invoice', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const result = {
      invoiceId: '44444444-4444-4444-8444-444444444444',
      tenantId: PRINCIPAL.tenantId,
      projectId: PROJECT_ID,
      status: 'draft' as const,
      invoiceNumber: 'INV-202608-001',
      billingPercentBps: 2500,
      retentionBps: 1000,
      subtotalCents: 0,
      retentionCents: 0,
      vatCents: 0,
      withholdingTaxCents: 0,
      netAmountCents: 0,
      dueDate: '2026-08-15T00:00:00.000Z',
      notes: 'Progress billing',
    }
    const request = {
      id: '55555555-5555-4555-8555-555555555555',
      requestHash: '',
      projectId: PROJECT_ID,
      state: 'succeeded' as const,
      result,
    }
    const project = selectQuery([
      {
        id: PROJECT_ID,
        accountId: '66666666-6666-4666-8666-666666666666',
      },
    ])
    const requestQuery = selectQuery([request])
    const insertValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce({ from: project.from })
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    }
    const { service, audit, transaction } = enabledService(transactionClient)

    await expect(
      service.create(PROJECT_ID, COMMAND, PRINCIPAL, 'invoice-draft-replay')
    ).resolves.toEqual(result)
    expect(transaction).toHaveBeenCalledOnce()
    expect(transactionClient.insert).toHaveBeenCalledOnce()
    expect(audit.stampActor).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })
})
