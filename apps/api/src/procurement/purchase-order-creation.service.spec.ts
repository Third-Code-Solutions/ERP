import 'reflect-metadata'

import {
  ConflictException,
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

  it('maps the tenant PO-number unique constraint to a safe conflict', async () => {
    const membershipQuery = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const request = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
    const insertRequestValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const insertPoValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockRejectedValue({
        code: '23505',
        constraint: 'ux_purchase_orders_tenant_po_number',
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
        .mockReturnValueOnce({ values: insertPoValues }),
      execute: vi.fn().mockResolvedValue(undefined),
    }
    const { candidate, audit } = enabledHarness(transactionClient)

    await expect(
      candidate.create(COMMAND, PRINCIPAL, 'po-create-unique-conflict')
    ).rejects.toEqual(
      expect.objectContaining({
        constructor: ConflictException,
        message:
          'Purchase Order number is already in use; resolve duplicate legacy records before retrying.',
      })
    )
    expect(transactionClient.insert).toHaveBeenCalledTimes(2)
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })
})

// D-4 regression harness: every Drizzle builder step returns the same node,
// and awaiting the node yields the canned rows for that query.
function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(rows).then(resolve, reject),
  }
  for (const method of [
    'from',
    'where',
    'limit',
    'for',
    'orderBy',
    'innerJoin',
    'set',
    'returning',
    'onConflictDoNothing',
  ]) {
    node[method] = vi.fn(() => node)
  }
  return node
}

type Row = Record<string, unknown>

function bomHarness(queryRows: unknown[][]) {
  const request = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    requestHash: '',
    state: 'processing',
    result: null,
  }
  const poInserts: Row[] = []
  const lineInserts: Row[][] = []
  const select = vi.fn()
  for (const rows of [
    [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }],
    [request],
    ...queryRows,
  ]) {
    select.mockReturnValueOnce(chain(rows))
  }
  const transactionClient = {
    select,
    insert: vi.fn(() => ({
      values: vi.fn((values: Row | Row[]) => {
        if (Array.isArray(values)) {
          lineInserts.push(values)
          return chain([])
        }
        if (typeof values.request_hash === 'string') {
          request.requestHash = values.request_hash
          return chain([])
        }
        poInserts.push(values)
        const suffix = String(poInserts.length).padStart(12, '0')
        return chain([
          { id: `cccccccc-cccc-4ccc-8ccc-${suffix}`, poNumber: values.po_number },
        ])
      }),
    })),
    update: vi.fn(() => chain([{ id: request.id }])),
    execute: vi.fn().mockResolvedValue(undefined),
  }
  const { candidate } = enabledHarness(transactionClient)
  return { candidate, poInserts, lineInserts }
}

let lineSeq = 0
function bomLine(
  values: Partial<{
    id: string
    code: string | null
    is_group: number
    parent_id: string | null
    parent_line_item_id: string | null
  }> & { quantity: number; unitCostCents: number }
) {
  lineSeq += 1
  return {
    id: `dddddddd-dddd-4ddd-8ddd-${String(lineSeq).padStart(12, '0')}`,
    code: null,
    description: `Line ${lineSeq}`,
    unit: 'pcs',
    is_group: 0,
    parent_id: null,
    parent_line_item_id: null,
    ...values,
  }
}

function sumLineTotals(lines: Row[] | undefined) {
  return (lines ?? []).reduce(
    (sum, line) => sum + (line.line_total_cents as number),
    0
  )
}

const LOCKED_BOM = {
  id: BOM_COMMAND.bomId,
  status: 'locked',
  projectId: BOM_COMMAND.projectId,
  // Stale BOM header value. D-4: the PO header must never use it.
  totalCostCents: 999_999_999,
}

async function createFromBomWith(rows: unknown[], budgetRows: unknown[] = []) {
  const harness = bomHarness([
    [LOCKED_BOM],
    [{ id: BOM_COMMAND.projectId }],
    rows,
    budgetRows,
    [{ maxNumericSuffix: '41' }],
  ])
  await harness.candidate.createFromBom(BOM_COMMAND, PRINCIPAL, 'bom-po-d4')
  expect(harness.poInserts).toHaveLength(1)
  expect(harness.lineInserts).toHaveLength(1)
  return { header: harness.poInserts[0]!, lines: harness.lineInserts[0]! }
}

describe('PO from BOM foots its header to its lines (D-4)', () => {
  it('buys the two children of a group header once and foots the header to them', async () => {
    const header = bomLine({ is_group: 1, quantity: 1, unitCostCents: 125_000 })
    const rows = [
      header,
      bomLine({ parent_line_item_id: header.id, quantity: 10, unitCostCents: 5_000 }),
      bomLine({ parent_line_item_id: header.id, quantity: 3, unitCostCents: 25_000 }),
    ]

    const po = await createFromBomWith(rows)

    // 10 x 50.00 + 3 x 250.00 = 1,250.00. The header row is not bought again.
    expect(po.lines.map((line) => line.bom_line_item_id)).toEqual([
      rows[1]!.id,
      rows[2]!.id,
    ])
    expect(po.lines.map((line) => line.line_total_cents)).toEqual([
      50_000, 75_000,
    ])
    expect(po.header).toMatchObject({
      subtotal_cents: 125_000,
      vat_cents: 15_000,
      withholding_tax_cents: 2_500,
      total_cents: 137_500,
    })
    expect(po.header.subtotal_cents).toBe(sumLineTotals(po.lines))
  })

  it('foots a flat BOM to Σ lines instead of the BOM total_cost_cents', async () => {
    const rows = [
      bomLine({ quantity: 24, unitCostCents: 8_500_000 }),
      bomLine({ quantity: 6, unitCostCents: 4_500_000 }),
      bomLine({ quantity: 320, unitCostCents: 120_000 }),
    ]

    const po = await createFromBomWith(rows)

    // 2,040,000.00 + 270,000.00 + 384,000.00 = 2,694,000.00
    expect(po.lines.map((line) => line.line_total_cents)).toEqual([
      204_000_000, 27_000_000, 38_400_000,
    ])
    expect(po.header).toMatchObject({
      subtotal_cents: 269_400_000,
      vat_cents: 32_328_000,
      withholding_tax_cents: 5_388_000,
      total_cents: 296_340_000,
    })
    expect(po.header.subtotal_cents).toBe(sumLineTotals(po.lines))
  })

  it('foots a messy nested BOM with rounding to its eleven leaf lines', async () => {
    const division = bomLine({ is_group: 1, quantity: 0, unitCostCents: 0 })
    const lighting = bomLine({
      is_group: 1,
      parent_id: division.id,
      quantity: 1,
      unitCostCents: 9_999_999,
    })
    const lightingWork = bomLine({
      parent_id: lighting.id,
      quantity: 5,
      unitCostCents: 333_333,
    })
    const power = bomLine({
      is_group: 1,
      parent_id: division.id,
      quantity: 2,
      unitCostCents: 500_001,
    })
    const powerWork = bomLine({
      parent_id: power.id,
      quantity: 4,
      unitCostCents: 88_888,
    })
    const leaves = [
      bomLine({ parent_line_item_id: lightingWork.id, quantity: 7, unitCostCents: 1_999 }),
      bomLine({ parent_line_item_id: lightingWork.id, quantity: 13, unitCostCents: 7_777 }),
      bomLine({ parent_id: lighting.id, quantity: 3, unitCostCents: 12_345 }),
      bomLine({ parent_line_item_id: powerWork.id, quantity: 11, unitCostCents: 3_333 }),
      bomLine({ parent_line_item_id: powerWork.id, quantity: 1, unitCostCents: 101 }),
      bomLine({ quantity: 17, unitCostCents: 2_499 }),
      bomLine({ quantity: 9, unitCostCents: 6_667 }),
      bomLine({ quantity: 1, unitCostCents: 1 }),
      bomLine({ quantity: 250, unitCostCents: 1_234 }),
      bomLine({ quantity: 0, unitCostCents: 50_000 }),
      bomLine({ quantity: 33, unitCostCents: 9_091 }),
    ]
    const emptyHeader = bomLine({ is_group: 1, quantity: 3, unitCostCents: 1_000 })
    const rows = [
      division,
      lighting,
      lightingWork,
      leaves[0],
      leaves[1],
      leaves[2],
      power,
      powerWork,
      leaves[3],
      leaves[4],
      ...leaves.slice(5),
      emptyHeader,
    ]

    const powerCostCode = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const po = await createFromBomWith(rows, [
      { bomLineItemId: powerWork.id, costCodeId: powerCostCode },
    ])

    expect(po.lines.map((line) => line.bom_line_item_id)).toEqual(
      leaves.map((line) => line.id)
    )
    // Material lines of the budgeted work item keep its cost code.
    expect(po.lines.map((line) => line.cost_code_id)).toEqual([
      undefined, undefined, undefined, powerCostCode, powerCostCode,
      undefined, undefined, undefined, undefined, undefined, undefined,
    ])
    expect(po.lines.map((line) => line.line_total_cents)).toEqual([
      13_993, 101_101, 37_035, 36_663, 101, 42_483, 60_003, 1, 308_500, 0,
      300_003,
    ])
    // Σ = 8,998.83. VAT 12% = 1,079.8596 -> 1,079.86. EWT 2% = 179.9766 -> 179.98.
    expect(po.header).toMatchObject({
      subtotal_cents: 899_883,
      vat_cents: 107_986,
      withholding_tax_cents: 17_998,
      total_cents: 989_871,
    })
    expect(po.header.subtotal_cents).toBe(sumLineTotals(po.lines))
  })

  it('prices rate-card lines at the rate that chose the vendor, not the BOM cost', async () => {
    const vendorA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea'
    const vendorB = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeeb'
    const header = bomLine({ is_group: 1, quantity: 1, unitCostCents: 3_500_000 })
    const cement = bomLine({
      code: 'CEM-40',
      parent_line_item_id: header.id,
      quantity: 100,
      unitCostCents: 26_000,
    })
    const rebar = bomLine({
      code: 'RBR-10',
      parent_line_item_id: header.id,
      quantity: 50,
      unitCostCents: 18_000,
    })
    const noCard = bomLine({ code: 'NO-CARD', quantity: 2, unitCostCents: 99_999 })
    const harness = bomHarness([
      [LOCKED_BOM],
      [header, cement, rebar, noCard],
      [],
      [
        { id: 'card-1', code: 'CEM-40', vendorId: vendorB, unitPriceCents: 25_000 },
        { id: 'card-2', code: 'CEM-40', vendorId: vendorA, unitPriceCents: 24_550 },
        { id: 'card-3', code: 'RBR-10', vendorId: vendorA, unitPriceCents: 17_325 },
      ],
      [
        { id: vendorA, name: 'Vendor A' },
        { id: vendorB, name: 'Vendor B' },
      ],
      [{ maxNumericSuffix: '7' }],
    ])

    const result = await harness.candidate.createGroupedFromBom(
      GROUPED_BOM_COMMAND,
      PRINCIPAL,
      'grouped-bom-po-d4'
    )

    // Vendor A wins cement at 245.50 and rebar at 173.25, so the PO uses those
    // rates: 100 x 245.50 + 50 x 173.25 = 33,212.50.
    expect(harness.poInserts).toHaveLength(1)
    const lines = harness.lineInserts[0]!
    expect(lines.map((line) => [line.unit_cost_cents, line.line_total_cents])).toEqual([
      [24_550, 2_455_000],
      [17_325, 866_250],
    ])
    expect(harness.poInserts[0]).toMatchObject({
      vendor_id: vendorA,
      subtotal_cents: 3_321_250,
      vat_cents: 398_550,
      withholding_tax_cents: 66_425,
      total_cents: 3_653_375,
    })
    expect(harness.poInserts[0]!.subtotal_cents).toBe(sumLineTotals(lines))
    // The line with no rate card keeps its BOM cost in the unassigned preview.
    expect(result.groups).toEqual([
      { vendorId: vendorA, vendorName: 'Vendor A', lineCount: 2, subtotalCents: 3_321_250 },
      {
        vendorId: null,
        vendorName: 'Unassigned (no rate card match)',
        lineCount: 1,
        subtotalCents: 199_998,
      },
    ])
  })
})
