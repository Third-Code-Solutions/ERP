import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
  writeAuditLogInTransaction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
  can: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({ db: mocks.db }))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
  notifyExternalEmail: vi.fn(),
}))

// Pin the legacy (non-Core) BOM PO paths regardless of the local env flags.
vi.mock('@/lib/erp-core-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/erp-core-client')>()),
  purchaseOrderBomWritesUseCoreApi: () => false,
  purchaseOrderBomGroupedWritesUseCoreApi: () => false,
}))

import {
  createPoFromBom,
  createPosFromBomGrouped,
  createStandalonePo,
  createVendor,
} from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.com',
  fullName: 'Procurement User',
}

describe('procurement vendor action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
  })

  it('rejects an unauthenticated vendor creation before database access', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const result = await createVendor(new FormData())

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('enforces the procurement capability before accepting vendor input', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    const formData = new FormData()
    formData.set('name', 'New Supplier')
    const result = await createVendor(formData)

    expect(result).toEqual({
      error: 'You do not have permission to create vendors.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(PROFILE, 'po.create')
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('rejects malformed vendor fields before opening a transaction', async () => {
    const formData = new FormData()
    formData.set('name', '   ')
    formData.set('email', 'not-an-email')

    const result = await createVendor(formData)

    expect(result).toEqual({ error: 'Invalid vendor details' })
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('commits vendor and audit event through one transaction', async () => {
    const returning = vi.fn().mockResolvedValue([
      { id: '33333333-3333-4333-8333-333333333333' },
    ])
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })
    mocks.db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ insert })
    )

    const formData = new FormData()
    formData.set('name', '  Acme Supplier  ')
    formData.set('email', 'supplier@example.com')

    const result = await createVendor(formData)

    expect(result).toEqual({})
    expect(mocks.db.transaction).toHaveBeenCalledOnce()
    expect(insert).toHaveBeenCalledOnce()
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: PROFILE.tenantId,
        name: 'Acme Supplier',
        email: 'supplier@example.com',
      })
    )
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: PROFILE.tenantId,
        actorId: PROFILE.user.id,
        entityType: 'vendor',
        entityId: '33333333-3333-4333-8333-333333333333',
        action: 'create',
      })
    )
  })
})

describe('purchase order creation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })
  })

  it('blocks BOM-generated Purchase Orders before database access', async () => {
    const result = await createPoFromBom(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      null,
      null
    )

    expect(result).toEqual({
      error: 'You do not have permission to create Purchase Orders.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(PROFILE, 'po.create')
    expect(mocks.db.select).not.toHaveBeenCalled()
  })

  it('blocks standalone Purchase Orders before parsing or database work', async () => {
    const result = await createStandalonePo(new FormData())

    expect(result).toEqual({
      error: 'You do not have permission to create Purchase Orders.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(PROFILE, 'po.create')
    expect(mocks.db.select).not.toHaveBeenCalled()
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
  for (const method of ['from', 'where', 'limit', 'for', 'orderBy', 'innerJoin', 'set', 'returning']) {
    node[method] = vi.fn(() => node)
  }
  return node
}

type Row = Record<string, unknown>

const BOM_ID = '55555555-5555-4555-8555-555555555555'
const PROJECT_ID = '66666666-6666-4666-8666-666666666666'
const APPROVED_BOM = {
  id: BOM_ID,
  status: 'approved',
  project_id: PROJECT_ID,
  // Stale BOM header value. D-4: the PO header must never use it.
  total_cost_cents: 999_999_999,
}

// Queues canned rows for db.select (outside) and tx.select (inside the
// transaction), and records every PO header and PO line insert.
function legacyPoHarness(outerRows: unknown[][], txRows: unknown[][]) {
  for (const rows of outerRows) mocks.db.select.mockReturnValueOnce(chain(rows))
  const txSelect = vi.fn()
  for (const rows of txRows) txSelect.mockReturnValueOnce(chain(rows))
  const poInserts: Row[] = []
  const lineInserts: Row[][] = []
  let sequence = 41
  const tx = {
    select: txSelect,
    execute: vi.fn(async () => {
      sequence += 1
      return [{ allocated_value: sequence }]
    }),
    insert: vi.fn(() => ({
      values: vi.fn((values: Row | Row[]) => {
        if (Array.isArray(values)) {
          lineInserts.push(values)
          return chain([])
        }
        poInserts.push(values)
        return chain([{ id: `po-${poInserts.length}` }])
      }),
    })),
    update: vi.fn(() => chain([])),
  }
  mocks.db.transaction.mockImplementation(
    async (callback: (client: unknown) => Promise<unknown>) => callback(tx)
  )
  return { poInserts, lineInserts }
}

let lineSeq = 0
function bomLine(
  values: Partial<{
    code: string | null
    unit: string | null
    is_group: number
    parent_id: string | null
    parent_line_item_id: string | null
  }> & { quantity: number; unit_cost_cents: number }
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

function rateCard(
  values: { id: string; code: string; vendorId: string | null; unitPriceCents: number } &
    Partial<{ unit: string; effectiveFrom: Date; effectiveTo: Date | null }>
) {
  return { unit: 'pcs', effectiveFrom: new Date(0), effectiveTo: null, ...values }
}

function sumLineTotals(lines: Row[] | undefined) {
  return (lines ?? []).reduce(
    (sum, line) => sum + (line.line_total_cents as number),
    0
  )
}

async function legacyCreatePoFromBom(rows: unknown[], budgetRows: unknown[] = []) {
  const harness = legacyPoHarness([[APPROVED_BOM]], [[APPROVED_BOM], rows, budgetRows])
  const result = await createPoFromBom(BOM_ID, PROJECT_ID, null, null)
  expect(result).toEqual({ id: 'po-1' })
  expect(harness.poInserts).toHaveLength(1)
  expect(harness.lineInserts).toHaveLength(1)
  return { header: harness.poInserts[0]!, lines: harness.lineInserts[0]! }
}

describe('legacy PO from BOM foots its header to its lines (D-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.select.mockReset()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
  })

  it('buys the two children of a group header once and foots the header to them', async () => {
    const header = bomLine({ is_group: 1, quantity: 1, unit_cost_cents: 125_000 })
    const rows = [
      header,
      bomLine({ parent_line_item_id: header.id, quantity: 10, unit_cost_cents: 5_000 }),
      bomLine({ parent_line_item_id: header.id, quantity: 3, unit_cost_cents: 25_000 }),
    ]

    const po = await legacyCreatePoFromBom(rows)

    // 10 x 50.00 + 3 x 250.00 = 1,250.00. The header row is not bought again.
    expect(po.lines.map((line) => line.bom_line_item_id)).toEqual([rows[1]!.id, rows[2]!.id])
    expect(po.lines.map((line) => line.line_total_cents)).toEqual([50_000, 75_000])
    expect(po.header).toMatchObject({
      subtotal_cents: 125_000,
      vat_cents: 15_000,
      withholding_tax_cents: 2_500,
      total_cents: 137_500,
    })
    expect(po.header.subtotal_cents).toBe(sumLineTotals(po.lines))
  })

  it('foots a flat BOM to the sum of lines instead of the BOM total_cost_cents', async () => {
    const rows = [
      bomLine({ quantity: 24, unit_cost_cents: 8_500_000 }),
      bomLine({ quantity: 6, unit_cost_cents: 4_500_000 }),
      bomLine({ quantity: 320, unit_cost_cents: 120_000 }),
    ]

    const po = await legacyCreatePoFromBom(rows)

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
    const division = bomLine({ is_group: 1, quantity: 0, unit_cost_cents: 0 })
    const lighting = bomLine({
      is_group: 1,
      parent_id: division.id,
      quantity: 1,
      unit_cost_cents: 9_999_999,
    })
    const lightingWork = bomLine({ parent_id: lighting.id, quantity: 5, unit_cost_cents: 333_333 })
    const power = bomLine({
      is_group: 1,
      parent_id: division.id,
      quantity: 2,
      unit_cost_cents: 500_001,
    })
    const powerWork = bomLine({ parent_id: power.id, quantity: 4, unit_cost_cents: 88_888 })
    const leaves = [
      bomLine({ parent_line_item_id: lightingWork.id, quantity: 7, unit_cost_cents: 1_999 }),
      bomLine({ parent_line_item_id: lightingWork.id, quantity: 13, unit_cost_cents: 7_777 }),
      bomLine({ parent_id: lighting.id, quantity: 3, unit_cost_cents: 12_345 }),
      bomLine({ parent_line_item_id: powerWork.id, quantity: 11, unit_cost_cents: 3_333 }),
      bomLine({ parent_line_item_id: powerWork.id, quantity: 1, unit_cost_cents: 101 }),
      bomLine({ quantity: 17, unit_cost_cents: 2_499 }),
      bomLine({ quantity: 9, unit_cost_cents: 6_667 }),
      bomLine({ quantity: 1, unit_cost_cents: 1 }),
      bomLine({ quantity: 250, unit_cost_cents: 1_234 }),
      bomLine({ quantity: 0, unit_cost_cents: 50_000 }),
      bomLine({ quantity: 33, unit_cost_cents: 9_091 }),
    ]
    const emptyHeader = bomLine({ is_group: 1, quantity: 3, unit_cost_cents: 1_000 })
    const rows = [
      division,
      lighting,
      lightingWork,
      ...leaves.slice(0, 3),
      power,
      powerWork,
      ...leaves.slice(3),
      emptyHeader,
    ]
    const powerCostCode = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

    const po = await legacyCreatePoFromBom(rows, [
      { bomLineItemId: powerWork.id, costCodeId: powerCostCode },
    ])

    expect(po.lines.map((line) => line.bom_line_item_id)).toEqual(leaves.map((line) => line.id))
    // Material lines of the budgeted work item keep its cost code.
    expect(po.lines.map((line) => line.cost_code_id)).toEqual([
      undefined, undefined, undefined, powerCostCode, powerCostCode,
      undefined, undefined, undefined, undefined, undefined, undefined,
    ])
    expect(po.lines.map((line) => line.line_total_cents)).toEqual([
      13_993, 101_101, 37_035, 36_663, 101, 42_483, 60_003, 1, 308_500, 0, 300_003,
    ])
    // Sum = 8,998.83. VAT 12% = 1,079.8596 -> 1,079.86. EWT 2% = 179.9766 -> 179.98.
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
    const workCostCode = 'ffffffff-ffff-4fff-8fff-fffffffffff1'
    // A non-group section holds a work item whose material lines are bought.
    const section = bomLine({ quantity: 0, unit_cost_cents: 0 })
    const work = bomLine({ parent_id: section.id, quantity: 1, unit_cost_cents: 3_500_000 })
    const cement = bomLine({
      code: 'CEM-40',
      unit: 'bag',
      parent_line_item_id: work.id,
      quantity: 100,
      unit_cost_cents: 26_000,
    })
    const rebar = bomLine({
      code: 'RBR-10',
      parent_line_item_id: work.id,
      quantity: 50,
      unit_cost_cents: 18_000,
    })
    const noCard = bomLine({ code: 'NO-CARD', quantity: 2, unit_cost_cents: 99_999 })
    const harness = legacyPoHarness(
      [[APPROVED_BOM]],
      [
        [APPROVED_BOM],
        [section, work, cement, rebar, noCard],
        [{ bomLineItemId: work.id, costCodeId: workCostCode }],
        [
          rateCard({ id: 'card-1', code: 'CEM-40', unit: 'bag', vendorId: vendorB, unitPriceCents: 25_000 }),
          rateCard({ id: 'card-2', code: 'CEM-40', unit: ' BAG ', vendorId: vendorA, unitPriceCents: 24_550 }),
          rateCard({ id: 'card-3', code: 'RBR-10', vendorId: vendorA, unitPriceCents: 17_325 }),
        ],
        [
          { id: vendorA, name: 'Vendor A' },
          { id: vendorB, name: 'Vendor B' },
        ],
      ]
    )

    const result = await createPosFromBomGrouped(BOM_ID)

    // Vendor A wins cement at 245.50 and rebar at 173.25, so the PO uses those
    // rates: 100 x 245.50 + 50 x 173.25 = 33,212.50.
    expect(harness.poInserts).toHaveLength(1)
    const lines = harness.lineInserts[0]!
    expect(lines.map((line) => line.bom_line_item_id)).toEqual([cement.id, rebar.id])
    expect(lines.map((line) => line.cost_code_id)).toEqual([workCostCode, workCostCode])
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
    expect(result).toEqual({
      created_po_ids: ['po-1'],
      groups: [
        { vendor_id: vendorA, vendor_name: 'Vendor A', line_count: 2, subtotal_cents: 3_321_250 },
        {
          vendor_id: null,
          vendor_name: 'Unassigned (no rate card match)',
          line_count: 1,
          subtotal_cents: 199_998,
        },
      ],
    })
  })

  it('ignores zero-price, expired, wrong-unit, vendorless and foreign-vendor cards', async () => {
    const vendorA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea'
    const vendorB = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeeb'
    const foreignVendor = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeec'
    const sand = bomLine({ code: 'SAND', unit: 'cu.m', quantity: 10, unit_cost_cents: 150_000 })
    const gravel = bomLine({ code: 'GRAVEL', unit: 'cu.m', quantity: 4, unit_cost_cents: 120_000 })
    const tile = bomLine({ code: 'TILE', unit: 'sqm', quantity: 20, unit_cost_cents: 50_000 })
    const paint = bomLine({ code: 'PAINT', unit: 'gal', quantity: 3, unit_cost_cents: 70_000 })
    const wire = bomLine({ code: 'WIRE', unit: 'm', quantity: 100, unit_cost_cents: 2_000 })
    const harness = legacyPoHarness(
      [[APPROVED_BOM]],
      [
        [APPROVED_BOM],
        [sand, gravel, tile, paint, wire],
        [],
        [
          // A 0 card must not win the cheapest pick; vendor B's 1,400.00 does.
          rateCard({ id: 'zero', code: 'SAND', unit: 'cu.m', vendorId: vendorA, unitPriceCents: 0 }),
          rateCard({ id: 'sand-b', code: 'SAND', unit: 'cu.m', vendorId: vendorB, unitPriceCents: 140_000 }),
          // An expired card is ignored even when cheaper.
          rateCard({
            id: 'expired',
            code: 'GRAVEL',
            unit: 'cu.m',
            vendorId: vendorA,
            unitPriceCents: 80_000,
            effectiveTo: new Date(Date.now() - 86_400_000),
          }),
          rateCard({ id: 'gravel-b', code: 'GRAVEL', unit: 'cu.m', vendorId: vendorB, unitPriceCents: 110_000 }),
          // Priced per piece, but the BOM buys tile per sqm.
          rateCard({ id: 'tile-pcs', code: 'TILE', unit: 'pcs', vendorId: vendorA, unitPriceCents: 30_000 }),
          // No vendor: the line stays at the BOM price, unassigned.
          rateCard({ id: 'paint-null', code: 'PAINT', unit: 'gal', vendorId: null, unitPriceCents: 60_000 }),
          // The vendor is not one of this tenant's vendors.
          rateCard({ id: 'wire-x', code: 'WIRE', unit: 'm', vendorId: foreignVendor, unitPriceCents: 1_500 }),
        ],
        [
          { id: vendorA, name: 'Vendor A' },
          { id: vendorB, name: 'Vendor B' },
        ],
      ]
    )

    const result = await createPosFromBomGrouped(BOM_ID)

    // Vendor B: 10 x 1,400.00 + 4 x 1,100.00 = 18,400.00.
    expect(harness.poInserts).toHaveLength(1)
    const lines = harness.lineInserts[0]!
    expect(lines.map((line) => [line.bom_line_item_id, line.unit_cost_cents])).toEqual([
      [sand.id, 140_000],
      [gravel.id, 110_000],
    ])
    expect(harness.poInserts[0]).toMatchObject({
      vendor_id: vendorB,
      subtotal_cents: 1_840_000,
      vat_cents: 220_800,
      withholding_tax_cents: 36_800,
      total_cents: 2_024_000,
    })
    expect(harness.poInserts[0]!.subtotal_cents).toBe(sumLineTotals(lines))
    // Tile, paint and wire stay unassigned at BOM cost: 10,000 + 2,100 + 2,000.
    expect(result).toEqual({
      created_po_ids: ['po-1'],
      groups: [
        { vendor_id: vendorB, vendor_name: 'Vendor B', line_count: 2, subtotal_cents: 1_840_000 },
        {
          vendor_id: null,
          vendor_name: 'Unassigned (no rate card match)',
          line_count: 3,
          subtotal_cents: 1_410_000,
        },
      ],
    })
  })
})
