import 'reflect-metadata'

import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import {
  CustomerInvoiceDraftCreateService,
  isBillableBomStatus,
  requireBillableBom,
} from './customer-invoice-draft-create.service'

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
  it('allows only approved or locked BOMs as billing sources', () => {
    expect(isBillableBomStatus('approved')).toBe(true)
    expect(isBillableBomStatus('locked')).toBe(true)
    expect(isBillableBomStatus('draft')).toBe(false)
    expect(isBillableBomStatus('archived')).toBe(false)

    expect(
      requireBillableBom({
        id: 'bom-approved',
        projectId: PROJECT_ID,
        status: 'approved',
        tcvCents: 1_000_000,
      })
    ).toMatchObject({ status: 'approved' })
    expect(() =>
      requireBillableBom({
        id: 'bom-draft',
        projectId: PROJECT_ID,
        status: 'draft',
        tcvCents: 1_000_000,
      })
    ).toThrow('BOM must be approved before billing')
    expect(() => requireBillableBom(undefined)).toThrow(
      'An approved BOM is required before billing'
    )
  })

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

  describe('cumulative progress billing cap (D-6)', () => {
    const BOM_ID = '77777777-7777-4777-8777-777777777777'
    const INVOICE_ID = '88888888-8888-4888-8888-888888888888'

    function aggregateQuery(rows: unknown[]) {
      const where = vi.fn().mockResolvedValue(rows)
      const from = vi.fn().mockReturnValue({ where })
      return { from, where }
    }

    function latestBomQuery(rows: unknown[]) {
      const rowLock = vi.fn().mockResolvedValue(rows)
      const limit = vi.fn().mockReturnValue({ for: rowLock })
      const orderBy = vi.fn().mockReturnValue({ limit })
      const where = vi.fn().mockReturnValue({ orderBy })
      const from = vi.fn().mockReturnValue({ where })
      return { from }
    }

    function draftHarness(
      billedPercentBps: string,
      tcvCents: string,
      latestBomId = BOM_ID
    ) {
      const membership = selectQuery([
        { tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email },
      ])
      const project = selectQuery([
        { id: PROJECT_ID, accountId: '66666666-6666-4666-8666-666666666666' },
      ])
      const request = {
        id: '55555555-5555-4555-8555-555555555555',
        requestHash: '',
        projectId: PROJECT_ID,
        state: 'processing' as const,
        result: null,
      }
      const requestQuery = selectQuery([request])
      const bom = selectQuery([
        { id: BOM_ID, projectId: PROJECT_ID, status: 'approved', tcvCents },
      ])
      const latestBom = latestBomQuery([
        { id: latestBomId, projectId: PROJECT_ID, status: 'approved', tcvCents },
      ])
      const billed = aggregateQuery([{ percentBps: billedPercentBps }])
      const taxProfiles = aggregateQuery([])
      const lastInvoice = aggregateQuery([{ highestSuffix: '0' }])
      const invoiceValues = vi.fn((values: Record<string, unknown>) => ({
        returning: vi.fn().mockResolvedValue([
          {
            ...values,
            id: INVOICE_ID,
            due_date: new Date('2026-08-15T00:00:00.000Z'),
          },
        ]),
      }))
      const transactionClient = {
        select: vi
          .fn()
          .mockReturnValueOnce({ from: membership.from })
          .mockReturnValueOnce({ from: project.from })
          .mockReturnValueOnce({ from: requestQuery.from })
          .mockReturnValueOnce({ from: bom.from })
          .mockReturnValueOnce({ from: latestBom.from })
          .mockReturnValueOnce({ from: billed.from })
          .mockReturnValueOnce({ from: taxProfiles.from })
          .mockReturnValueOnce({ from: lastInvoice.from }),
        insert: vi
          .fn()
          .mockReturnValueOnce({
            values: vi.fn((values: Record<string, unknown>) => {
              request.requestHash = String(values.request_hash)
              return { onConflictDoNothing: vi.fn() }
            }),
          })
          .mockReturnValueOnce({ values: invoiceValues }),
        execute: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: request.id }]),
            }),
          }),
        }),
      }
      return { transactionClient, billed, invoiceValues }
    }

    it('rejects an explicit bomId that is not the latest approved BOM', async () => {
      // A superseded approved BOM could carry a stale, higher TCV.
      const { transactionClient, billed, invoiceValues } = draftHarness(
        '0',
        '100000000',
        '99999999-9999-4999-8999-999999999999'
      )
      const { service } = enabledService(transactionClient)

      const attempt = service.create(
        PROJECT_ID,
        { ...COMMAND, bomId: BOM_ID },
        PRINCIPAL,
        'invoice-draft-stale-bom'
      )

      await expect(attempt).rejects.toBeInstanceOf(ConflictException)
      await expect(attempt).rejects.toThrow(
        "Only the project's latest approved BOM can be billed"
      )
      expect(billed.from).not.toHaveBeenCalled()
      expect(invoiceValues).not.toHaveBeenCalled()
    })

    it('rejects 100.01% cumulative billing without inserting an invoice', async () => {
      // 75.00% already billed + 25.01% requested = 100.01%
      const { transactionClient, invoiceValues } = draftHarness('7500', '100000000')
      const { service, audit } = enabledService(transactionClient)

      const attempt = service.create(
        PROJECT_ID,
        { ...COMMAND, billingPercentBps: 2501, bomId: BOM_ID },
        PRINCIPAL,
        'invoice-draft-over-cap'
      )

      await expect(attempt).rejects.toBeInstanceOf(ConflictException)
      await expect(attempt).rejects.toThrow(
        'Cumulative progress billing cannot exceed 100% of the contract: 75.00% already billed, 25.00% remaining.'
      )
      expect(invoiceValues).not.toHaveBeenCalled()
      expect(transactionClient.execute).not.toHaveBeenCalled()
      expect(audit.writeSemantic).not.toHaveBeenCalled()
    })

    it('accepts exactly 100% cumulative billing with unchanged invoice math', async () => {
      // 75.00% already billed + 25.00% of TCV PHP 1,000,000.00 = 100%
      const { transactionClient, billed, invoiceValues } = draftHarness('7500', '100000000')
      const { service } = enabledService(transactionClient)

      const result = await service.create(
        PROJECT_ID,
        { ...COMMAND, billingPercentBps: 2500, bomId: BOM_ID },
        PRINCIPAL,
        'invoice-draft-at-cap'
      )

      // subtotal 25,000,000; retention 10% 2,500,000; base 22,500,000;
      // VAT 12% 2,700,000; EWT 2% 450,000; net 24,750,000
      expect(result).toMatchObject({
        invoiceId: INVOICE_ID,
        billingPercentBps: 2500,
        subtotalCents: 25_000_000,
        retentionCents: 2_500_000,
        vatCents: 2_700_000,
        withholdingTaxCents: 450_000,
        netAmountCents: 24_750_000,
      })
      expect(invoiceValues).toHaveBeenCalledOnce()

      const condition = billed.where.mock.calls[0]?.[0] as SQL | undefined
      if (!condition) throw new Error('Missing billed-percent filter')
      const query = new PgDialect().sqlToQuery(condition)
      expect(query.sql).toContain('"invoices"."tenant_id" = $1')
      expect(query.sql).toContain('"invoices"."project_id" = $2')
      expect(query.sql).toContain('"invoices"."status" <> $3')
      expect(query.sql).toContain('"invoices"."reversed_at" is null')
      expect(query.params).toEqual([PRINCIPAL.tenantId, PROJECT_ID, 'cancelled'])
      // The award down-payment draft is not filtered out: it counts toward the cap.
      expect(query.sql).not.toContain('invoice_number')
    })

    it('accepts a first bill when nothing has been billed yet', async () => {
      // Messy: 33.33% of TCV PHP 12,345.67 -> 411,481.18 half-up 411,481 centavos
      const { transactionClient } = draftHarness('0', '1234567')
      const { service } = enabledService(transactionClient)

      await expect(
        service.create(
          PROJECT_ID,
          { ...COMMAND, billingPercentBps: 3333, bomId: BOM_ID },
          PRINCIPAL,
          'invoice-draft-first'
        )
      ).resolves.toMatchObject({ subtotalCents: 411_481 })
    })
  })

  describe('effective tax rates (spec tenancy C-1, C-2)', () => {
    const BOM_ID = '77777777-7777-4777-8777-777777777777'
    const INVOICE_ID = '88888888-8888-4888-8888-888888888888'
    const PROFILE_ID = '99999999-9999-4999-8999-999999999999'

    function aggregateQuery(rows: unknown[]) {
      const where = vi.fn().mockResolvedValue(rows)
      const from = vi.fn().mockReturnValue({ where })
      return { from, where }
    }

    function latestBomQuery(rows: unknown[]) {
      const rowLock = vi.fn().mockResolvedValue(rows)
      const limit = vi.fn().mockReturnValue({ for: rowLock })
      const orderBy = vi.fn().mockReturnValue({ limit })
      const where = vi.fn().mockReturnValue({ orderBy })
      const from = vi.fn().mockReturnValue({ where })
      return { from }
    }

    function profileRow(overrides: Record<string, unknown>) {
      return {
        id: PROFILE_ID,
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

    // Select order: membership, project, idempotency claim, latest BOM,
    // billed percent, tax profiles (the real resolver), last invoice number.
    function harness(taxProfileRows: unknown[]) {
      const membership = selectQuery([
        { tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email },
      ])
      const project = selectQuery([
        { id: PROJECT_ID, accountId: '66666666-6666-4666-8666-666666666666' },
      ])
      const request = {
        id: '55555555-5555-4555-8555-555555555555',
        requestHash: '',
        projectId: PROJECT_ID,
        state: 'processing' as const,
        result: null,
      }
      const requestQuery = selectQuery([request])
      const latestBom = latestBomQuery([
        { id: BOM_ID, projectId: PROJECT_ID, status: 'approved', tcvCents: '100000000' },
      ])
      const billed = aggregateQuery([{ percentBps: '0' }])
      const taxProfiles = aggregateQuery(taxProfileRows)
      const lastInvoice = aggregateQuery([{ highestSuffix: '0' }])
      const invoiceValues = vi.fn((values: Record<string, unknown>) => ({
        returning: vi.fn().mockResolvedValue([
          { ...values, id: INVOICE_ID, due_date: new Date('2026-08-15T00:00:00.000Z') },
        ]),
      }))
      const transactionClient = {
        select: vi
          .fn()
          .mockReturnValueOnce({ from: membership.from })
          .mockReturnValueOnce({ from: project.from })
          .mockReturnValueOnce({ from: requestQuery.from })
          .mockReturnValueOnce({ from: latestBom.from })
          .mockReturnValueOnce({ from: billed.from })
          .mockReturnValueOnce({ from: taxProfiles.from })
          .mockReturnValueOnce({ from: lastInvoice.from }),
        insert: vi
          .fn()
          .mockReturnValueOnce({
            values: vi.fn((values: Record<string, unknown>) => {
              request.requestHash = String(values.request_hash)
              return { onConflictDoNothing: vi.fn() }
            }),
          })
          .mockReturnValueOnce({ values: invoiceValues }),
        execute: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: request.id }]),
            }),
          }),
        }),
      }
      return { transactionClient, taxProfiles, invoiceValues }
    }

    function auditTax(audit: { writeSemantic: ReturnType<typeof vi.fn> }) {
      const entry = audit.writeSemantic.mock.calls[0]?.[1] as
        | { diff: { tax: unknown } }
        | undefined
      return entry?.diff.tax
    }

    it("AC-TEN-06 / I-1: no profile keeps today's amounts and audits the default source", async () => {
      const { transactionClient, taxProfiles, invoiceValues } = harness([])
      const { service, audit } = enabledService(transactionClient)

      await expect(
        service.create(PROJECT_ID, COMMAND, PRINCIPAL, 'invoice-draft-default-tax')
      ).resolves.toMatchObject({
        retentionBps: 1000,
        subtotalCents: 25_000_000,
        retentionCents: 2_500_000,
        vatCents: 2_700_000,
        withholdingTaxCents: 450_000,
        netAmountCents: 24_750_000,
      })
      expect(invoiceValues.mock.calls[0]?.[0]).toMatchObject({ retention_bps: 1000 })
      expect(auditTax(audit)).toEqual({
        vatBps: 1200,
        ewtBps: 200,
        retentionBps: 1000,
        vatRegistered: true,
        source: 'default',
        profileId: null,
        profileCode: null,
        asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      })
      const condition = taxProfiles.where.mock.calls[0]?.[0] as SQL | undefined
      if (!condition) throw new Error('Missing tax profile filter')
      expect(new PgDialect().sqlToQuery(condition).params[0]).toBe(PRINCIPAL.tenantId)
    })

    it('AC-TEN-07 / P-1: an active profile sets the rates, stored retention and audit source', async () => {
      const { transactionClient, invoiceValues } = harness([
        profileRow({ withholding_rate_bps: 100, retention_rate_bps: 500 }),
      ])
      const { service, audit } = enabledService(transactionClient)

      await expect(
        service.create(PROJECT_ID, COMMAND, PRINCIPAL, 'invoice-draft-profile-tax')
      ).resolves.toMatchObject({
        retentionBps: 500,
        retentionCents: 1_250_000,
        vatCents: 2_850_000,
        withholdingTaxCents: 237_500,
        netAmountCents: 26_362_500,
      })
      expect(invoiceValues.mock.calls[0]?.[0]).toMatchObject({ retention_bps: 500 })
      expect(auditTax(audit)).toMatchObject({
        source: 'profile',
        profileId: PROFILE_ID,
        profileCode: 'P-2026',
        retentionBps: 500,
        ewtBps: 100,
      })
    })

    it('AC-TEN-08 / P-2: a non-VAT profile charges no VAT and audits vatBps 0', async () => {
      const { transactionClient } = harness([profileRow({ vat_registered: false })])
      const { service, audit } = enabledService(transactionClient)

      await expect(
        service.create(PROJECT_ID, COMMAND, PRINCIPAL, 'invoice-draft-non-vat')
      ).resolves.toMatchObject({
        vatCents: 0,
        withholdingTaxCents: 450_000,
        netAmountCents: 22_050_000,
      })
      expect(auditTax(audit)).toMatchObject({ vatBps: 0, vatRegistered: false })
    })

    it('AC-TEN-19: overlapping active profiles refuse the draft with 409 and insert nothing', async () => {
      const { transactionClient, invoiceValues } = harness([
        profileRow({ code: 'B' }),
        profileRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'A' }),
      ])
      const { service, audit } = enabledService(transactionClient)

      const attempt = service.create(PROJECT_ID, COMMAND, PRINCIPAL, 'invoice-draft-overlap')
      await expect(attempt).rejects.toBeInstanceOf(ConflictException)
      await expect(attempt).rejects.toThrow(
        /^TAX_PROFILE_OVERLAP: active tax profiles A, B all cover/
      )
      expect(invoiceValues).not.toHaveBeenCalled()
      expect(transactionClient.execute).not.toHaveBeenCalled()
      expect(audit.writeSemantic).not.toHaveBeenCalled()
    })
  })
})
