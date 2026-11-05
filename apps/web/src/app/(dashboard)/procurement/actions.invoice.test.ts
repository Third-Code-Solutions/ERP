import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
  can: vi.fn(),
}))

vi.mock('@third-code-erp/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@third-code-erp/database')>()),
  db: mocks.db,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: vi.fn(),
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
  notifyExternalEmail: vi.fn(),
}))

import { createInvoice } from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const BOM_ID = '44444444-4444-4444-8444-444444444444'
const INVOICE_ID = '55555555-5555-4555-8555-555555555555'

function harness(billedPercentBps: string, taxProfileRows: unknown[] = []) {
  mocks.db.select
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: async () => [{ id: PROJECT_ID, account_id: null }] }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: async () => [
          { tcv_cents: 100_000_000, status: 'approved', project_id: PROJECT_ID },
        ],
      }),
    })

  const projectLock = vi.fn().mockResolvedValue([{ id: PROJECT_ID }])
  const billedWhere = vi.fn().mockResolvedValue([{ percentBps: billedPercentBps }])
  const invoiceValues = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([{ id: INVOICE_ID }]),
  }))
  const tx = {
    select: vi
      .fn()
      .mockReturnValueOnce({ from: () => ({ where: () => ({ for: projectLock }) }) })
      .mockReturnValueOnce({ from: () => ({ where: billedWhere }) })
      // The real tenant tax-rate resolver reads the tenant's profiles here.
      .mockReturnValueOnce({ from: () => ({ where: async () => taxProfileRows }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ highest_suffix: '0' }] }) }),
    execute: vi.fn().mockResolvedValue([]),
    insert: vi.fn(() => ({ values: invoiceValues })),
  }
  mocks.db.transaction.mockImplementation(
    async (callback: (transaction: typeof tx) => unknown) => callback(tx)
  )
  return { tx, projectLock, billedWhere, invoiceValues }
}

describe('legacy createInvoice cumulative billing cap (D-6)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
  })

  it('rejects 100.01% cumulative billing without inserting an invoice', async () => {
    // 75.00% billed + 25.01% requested
    const { tx, invoiceValues } = harness('7500')

    await expect(createInvoice(PROJECT_ID, BOM_ID, 2501, null)).resolves.toEqual({
      error:
        'Cumulative progress billing cannot exceed 100% of the contract: 75.00% already billed, 25.00% remaining.',
    })
    expect(tx.execute).not.toHaveBeenCalled()
    expect(invoiceValues).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('accepts exactly 100% under the project lock with unchanged invoice math', async () => {
    const { projectLock, billedWhere, invoiceValues } = harness('7500')

    await expect(createInvoice(PROJECT_ID, BOM_ID, 2500, null)).resolves.toEqual({
      id: INVOICE_ID,
    })
    expect(projectLock).toHaveBeenCalledWith('update')
    // 25% of PHP 1,000,000.00: retention 2,500,000; VAT 2,700,000; EWT 450,000
    expect(invoiceValues).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_percent_bps: 2500,
        subtotal_cents: 25_000_000,
        retention_cents: 2_500_000,
        vat_cents: 2_700_000,
        withholding_tax_cents: 450_000,
        net_amount_cents: 24_750_000,
      })
    )

    const condition = billedWhere.mock.calls[0]?.[0] as SQL | undefined
    if (!condition) throw new Error('Missing billed-percent filter')
    const query = new PgDialect().sqlToQuery(condition)
    expect(query.sql).toContain('"invoices"."tenant_id" = $1')
    expect(query.sql).toContain('"invoices"."reversed_at" is null')
    expect(query.params).toEqual([PROFILE.tenantId, PROJECT_ID, 'cancelled'])
    // The award down-payment draft is not filtered out: it counts toward the cap.
    expect(query.sql).not.toContain('invoice_number')
  })
})

describe('legacy createInvoice effective tax rates (spec tenancy C-1, C-2)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
  })

  function profileRow(overrides: Record<string, unknown>) {
    return {
      id: '66666666-6666-4666-8666-666666666666',
      code: 'P-2026',
      status: 'active',
      valid_from: '2026-01-01',
      valid_to: null,
      vat_rate_bps: 1200,
      withholding_rate_bps: 200,
      retention_rate_bps: 1000,
      vat_registered: true,
      ...overrides,
    }
  }

  function auditTax() {
    const entry = mocks.writeAuditLog.mock.calls[0]?.[0] as { diff: { tax: unknown } } | undefined
    return entry?.diff.tax
  }

  it("AC-TEN-06 / I-1: no profile keeps today's amounts, stores retention 1000 and audits the default", async () => {
    const { invoiceValues } = harness('0')

    await expect(createInvoice(PROJECT_ID, BOM_ID, 2500, null)).resolves.toEqual({ id: INVOICE_ID })
    expect(invoiceValues).toHaveBeenCalledWith(
      expect.objectContaining({
        retention_bps: 1000,
        subtotal_cents: 25_000_000,
        retention_cents: 2_500_000,
        vat_cents: 2_700_000,
        withholding_tax_cents: 450_000,
        net_amount_cents: 24_750_000,
      })
    )
    expect(auditTax()).toEqual({
      vatBps: 1200,
      ewtBps: 200,
      retentionBps: 1000,
      vatRegistered: true,
      source: 'default',
      profileId: null,
      profileCode: null,
      asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
  })

  it('AC-TEN-08 / P-2: a non-VAT profile charges no VAT and audits vatBps 0', async () => {
    const { invoiceValues } = harness('0', [profileRow({ vat_registered: false })])

    await expect(createInvoice(PROJECT_ID, BOM_ID, 2500, null)).resolves.toEqual({ id: INVOICE_ID })
    expect(invoiceValues).toHaveBeenCalledWith(
      expect.objectContaining({ vat_cents: 0, withholding_tax_cents: 450_000, net_amount_cents: 22_050_000 })
    )
    expect(auditTax()).toMatchObject({ vatBps: 0, vatRegistered: false, source: 'profile', profileCode: 'P-2026' })
  })

  it('AC-TEN-19: overlapping profiles return the error and insert nothing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { invoiceValues } = harness('0', [
      profileRow({ code: 'B' }),
      profileRow({ id: '77777777-7777-4777-8777-777777777777', code: 'A' }),
    ])

    const result = await createInvoice(PROJECT_ID, BOM_ID, 2500, null)

    expect(result).toEqual({
      error: expect.stringMatching(/^TAX_PROFILE_OVERLAP: active tax profiles A, B all cover/),
    })
    expect(invoiceValues).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('[tax-rates]', expect.stringContaining('TAX_PROFILE_OVERLAP'))
    consoleError.mockRestore()
  })
})
