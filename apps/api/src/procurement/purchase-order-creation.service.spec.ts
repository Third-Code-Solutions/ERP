import 'reflect-metadata'

import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type {
  CreatePurchaseOrderCommand,
  CreatePurchaseOrderFromBomCommand,
  CreatePurchaseOrdersGroupedFromBomCommand,
} from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { PurchaseOrderCreationService } from './purchase-order-creation.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}

const COMMAND: CreatePurchaseOrderCommand = {
  projectId: '33333333-3333-4333-8333-333333333333',
  vendorId: null,
  deliveryDate: null,
  notes: null,
  lines: [
    {
      description: 'Concrete',
      quantity: 1,
      unitCostCents: 10_000,
      costCodeId: '44444444-4444-4444-8444-444444444444',
    },
  ],
}

const BOM_COMMAND: CreatePurchaseOrderFromBomCommand = {
  bomId: '55555555-5555-4555-8555-555555555555',
  projectId: COMMAND.projectId,
  vendorId: null,
  deliveryDate: null,
  notes: null,
}

const GROUPED_BOM_COMMAND: CreatePurchaseOrdersGroupedFromBomCommand = {
  bomId: BOM_COMMAND.bomId,
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) => {
      if (
        key === 'ERP_PO_CREATE_WRITES_ENABLED' ||
        key === 'ERP_PO_BOM_CREATE_WRITES_ENABLED' ||
        key === 'ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED'
      ) {
        return enabled
      }
      if (
        key === 'ERP_PO_CREATE_WRITES_TENANT_IDS' ||
        key === 'ERP_PO_BOM_CREATE_WRITES_TENANT_IDS' ||
        key === 'ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS'
      ) {
        return tenantIds
      }
      return undefined
    }),
  } as unknown as ConfigService
  return new PurchaseOrderCreationService(
    config,
    {} as DatabaseService,
    {} as AuditService
  )
}

function selectQuery(rows: unknown[]) {
  const rowLock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: rowLock })
  const where = vi.fn().mockReturnValue({ limit, for: rowLock })
  const from = vi.fn().mockReturnValue({ where })
  return { from, where, limit, rowLock }
}

function enabledHarness(
  transactionClient: Record<string, unknown>,
  audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
) {
  const config = {
    get: vi.fn((key: string) => {
      if (
        key === 'ERP_PO_CREATE_WRITES_ENABLED' ||
        key === 'ERP_PO_BOM_CREATE_WRITES_ENABLED' ||
        key === 'ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED'
      ) {
        return true
      }
      if (
        key === 'ERP_PO_CREATE_WRITES_TENANT_IDS' ||
        key === 'ERP_PO_BOM_CREATE_WRITES_TENANT_IDS' ||
        key === 'ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS'
      ) {
        return [PRINCIPAL.tenantId]
      }
      return undefined
    }),
  } as unknown as ConfigService
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  const auditService = audit as unknown as AuditService
  const candidate = new PurchaseOrderCreationService(
    config,
    { client: { transaction } } as unknown as DatabaseService,
    auditService
  )
  return { candidate, transaction, audit }
}

describe('PurchaseOrderCreationService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    await expect(
      service().create(COMMAND, PRINCIPAL, 'po-create-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    await expect(
      service(true).create(COMMAND, PRINCIPAL, 'po-create-1')
    ).rejects.toThrow(
      'Purchase Order command is not enabled for this tenant; no Purchase Order was created.'
    )
  })

  it('fails closed for BOM-to-PO creation by default', async () => {
    await expect(
      service().createFromBom(BOM_COMMAND, PRINCIPAL, 'bom-po-create-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('keeps BOM-to-PO creation disabled without its tenant allowlist', async () => {
    await expect(
      service(true).createFromBom(BOM_COMMAND, PRINCIPAL, 'bom-po-create-1')
    ).rejects.toThrow(
      'BOM Purchase Order command is not enabled for this tenant; no Purchase Order was created.'
    )
  })

  it('fails closed by default for grouped BOM-to-PO creation', async () => {
    await expect(
      service().createGroupedFromBom(
        GROUPED_BOM_COMMAND,
        PRINCIPAL,
        'grouped-bom-po-create-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('keeps grouped BOM-to-PO creation disabled without its tenant allowlist', async () => {
    await expect(
      service(true).createGroupedFromBom(
        GROUPED_BOM_COMMAND,
        PRINCIPAL,
        'grouped-bom-po-create-1'
      )
    ).rejects.toThrow(
      'Grouped BOM Purchase Order command is not enabled for this tenant; no Purchase Orders were created.'
    )
  })

  it('denies a non-procurement role before claiming Purchase Order idempotency', async () => {
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
    const { candidate, audit } = enabledHarness(transactionClient)

    await expect(
      candidate.create(COMMAND, PRINCIPAL, 'po-create-role-denied')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('denies a principal with no tenant membership before any Purchase Order write', async () => {
    const membershipQuery = selectQuery([])
    const transactionClient = {
      select: vi.fn().mockReturnValue({ from: membershipQuery.from }),
      insert: vi.fn(),
    }
    const { candidate, audit } = enabledHarness(transactionClient)

    await expect(
      candidate.create(COMMAND, PRINCIPAL, 'po-create-cross-tenant')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('creates exact centavo totals and audits bounded Purchase Order evidence in one transaction', async () => {
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
      state: 'processing',
      result: null,
    }
    const requestQuery = selectQuery([request])
    const projectQuery = selectQuery([{ id: COMMAND.projectId }])
    const costCodesQuery = selectQuery([{ id: COMMAND.lines[0]!.costCodeId }])
    const numberQuery = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ maxNumericSuffix: '41' }]),
      }),
    }
    const created = {
      id: '77777777-7777-4777-8777-777777777777',
      poNumber: 'PO-0042',
    }
    const insertRequestValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const insertPoValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([created]),
    })
    const insertLineValues = vi.fn().mockResolvedValue(undefined)
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
        .mockReturnValueOnce({ from: costCodesQuery.from })
        .mockReturnValueOnce({ from: numberQuery.from }),
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: insertRequestValues })
        .mockReturnValueOnce({ values: insertPoValues })
        .mockReturnValueOnce({ values: insertLineValues }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
      execute: vi.fn().mockResolvedValue(undefined),
    }
    const { candidate, transaction, audit } = enabledHarness(transactionClient)

    await expect(
      candidate.create(COMMAND, PRINCIPAL, 'po-create-exact')
    ).resolves.toEqual({
      purchaseOrderId: created.id,
      tenantId: PRINCIPAL.tenantId,
      poNumber: created.poNumber,
      status: 'draft',
    })
    expect(transaction).toHaveBeenCalledOnce()
    expect(insertPoValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: PRINCIPAL.tenantId,
        project_id: COMMAND.projectId,
        po_number: 'PO-0042',
        subtotal_cents: 10_000,
        vat_cents: 1_200,
        withholding_tax_cents: 200,
        total_cents: 11_000,
      })
    )
    expect(insertLineValues).toHaveBeenCalledWith([
      expect.objectContaining({
        tenant_id: PRINCIPAL.tenantId,
        po_id: created.id,
        quantity: 1,
        unit_cost_cents: 10_000,
        line_total_cents: 10_000,
        cost_code_id: COMMAND.lines[0]!.costCodeId,
      }),
    ])
    expect(audit.writeSemantic).toHaveBeenCalledOnce()
    const auditInput = audit.writeSemantic.mock.calls[0]?.[1] as {
      diff: Record<string, unknown>
    }
    expect(auditInput.diff).toMatchObject({
      project_id: COMMAND.projectId,
      vendor_id: null,
      subtotal_cents: 10_000,
      line_count: 1,
    })
    expect(auditInput.diff.idempotency_key_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(auditInput.diff).not.toHaveProperty('description')
    expect(auditInput.diff).not.toHaveProperty('notes')
  })

  it('replays the exact Purchase Order result without a second ERP insert or audit row', async () => {
    const membershipQuery = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const replay = {
      purchaseOrderId: '88888888-8888-4888-8888-888888888888',
      tenantId: PRINCIPAL.tenantId,
      poNumber: 'PO-0042',
      status: 'draft' as const,
    }
    const request = {
      id: '99999999-9999-4999-8999-999999999999',
      requestHash: '',
      state: 'succeeded',
      result: replay,
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
    const { candidate, transaction, audit } = enabledHarness(transactionClient)

    await expect(
      candidate.create(COMMAND, PRINCIPAL, 'po-create-replay')
    ).resolves.toEqual(replay)
    expect(transaction).toHaveBeenCalledOnce()
    expect(transactionClient.select).toHaveBeenCalledTimes(2)
    expect(transactionClient.insert).toHaveBeenCalledOnce()
    expect(audit.stampActor).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })
})
