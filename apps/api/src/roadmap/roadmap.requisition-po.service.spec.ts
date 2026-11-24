import 'reflect-metadata'

import { ConflictException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { RoadmapService } from './roadmap.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}
const REQUISITION_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const VENDOR_ID = '55555555-5555-4555-8555-555555555555'
const PO_ID = '66666666-6666-4666-8666-666666666666'
const PROFILE_ID = '99999999-9999-4999-8999-999999999999'

type Row = Record<string, unknown>

// Every Drizzle builder step returns the same node; awaiting it yields rows.
function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  }
  for (const method of ['from', 'where', 'limit', 'for', 'orderBy', 'set', 'returning']) {
    node[method] = vi.fn(() => node)
  }
  return node
}

const REQUISITION = {
  id: REQUISITION_ID,
  tenant_id: PRINCIPAL.tenantId,
  project_id: PROJECT_ID,
  requester_id: PRINCIPAL.userId,
  requisition_number: 'REQ-0001',
  status: 'approved',
  estimated_total_cents: 0n,
  approved_by: null,
  approved_at: null,
  converted_purchase_order_id: null,
}

function line(index: number, quantity: number) {
  return {
    id: `77777777-7777-4777-8777-00000000000${index}`,
    line_number: index,
    description: `Line ${index}`,
    material_item_id: null,
    bom_line_item_id: null,
    cost_code_id: null,
    uom_id: null,
    quantity_micros: String(quantity * 1_000_000),
  }
}

function quote(index: number, unitPriceCents: number) {
  return {
    id: `88888888-8888-4888-8888-00000000000${index}`,
    vendor_id: VENDOR_ID,
    material_item_id: null,
    unit_price_cents: unitPriceCents,
  }
}

function profileRow(overrides: Row = {}) {
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

function harness(lines: Row[], quotes: Row[], taxRows: unknown[], priorEvent: Row[] = []) {
  const poInserts: Row[] = []
  const eventInserts: Row[] = []
  const lineInserts: Row[][] = []
  const select = vi.fn()
  // Select order: principal, prior event, requisition FOR UPDATE, tax profiles
  // (the real resolver), requisition lines, quotes, PO count, result line count.
  for (const rows of [
    [{ id: PRINCIPAL.userId }],
    priorEvent,
    [REQUISITION],
    taxRows,
    lines,
    quotes,
    [{ count: '0' }],
    [{ count: lines.length }],
  ]) {
    select.mockReturnValueOnce(chain(rows))
  }
  const transactionClient = {
    select,
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(() => ({
      values: vi.fn((values: Row | Row[]) => {
        if (Array.isArray(values)) {
          lineInserts.push(values)
          return chain([])
        }
        if ('po_number' in values) {
          poInserts.push(values)
          return chain([{ id: PO_ID }])
        }
        if ('idempotency_key' in values) eventInserts.push(values)
        return chain([])
      }),
    })),
    update: vi.fn(() => chain([{ ...REQUISITION, status: 'converted' }])),
  }
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
  const config = {
    get: vi.fn((key: string) => key === 'ERP_ROADMAP_PROCUREMENT_LIFECYCLE_ENABLED'),
  } as unknown as ConfigService
  const service = new RoadmapService(
    config,
    {
      client: {
        transaction: async (callback: (tx: unknown) => unknown) => callback(transactionClient),
      },
    } as unknown as DatabaseService,
    audit as unknown as AuditService,
  )
  const convert = (key: string, selectedQuoteIds = quotes.map((value) => String(value.id))) =>
    service.transitionRequisition(REQUISITION_ID, { action: 'convert_to_po', selectedQuoteIds }, PRINCIPAL, key)
  return { convert, poInserts, lineInserts, eventInserts, audit, select }
}

function auditTax(audit: { writeSemantic: ReturnType<typeof vi.fn> }) {
  const entry = audit.writeSemantic.mock.calls[0]?.[1] as { diff: { tax: unknown } } | undefined
  return entry?.diff.tax
}

describe('requisition-to-PO retry keys', () => {
  it('refuses a conversion key retried with another quote selection and creates no PO', async () => {
    const lines = [line(1, 120), line(2, 2_500)]
    const quotes = [quote(1, 28_550), quote(2, 1_875)]
    const first = harness(lines, quotes, [])
    await expect(first.convert('req-po-retry')).resolves.toMatchObject({ status: 'converted' })
    const event = first.eventInserts[0]!
    expect(event.request_hash).toMatch(/^[0-9a-f]{64}$/)

    const prior = {
      requisitionId: event.requisition_id,
      action: event.action,
      actorId: event.actor_id,
      requestHash: event.request_hash,
      reason: event.reason,
    }
    const retry = harness(lines, quotes, [], [prior])
    const result = retry.convert('req-po-retry', [String(quotes[1]!.id), String(quotes[0]!.id)])
    await expect(result).rejects.toThrow('Idempotency key was already used for another workflow command')
    expect(retry.select).toHaveBeenCalledTimes(2)
    expect(retry.poInserts).toHaveLength(0)
    expect(retry.eventInserts).toHaveLength(0)
  })
})

describe('requisition-to-PO effective tax rates (spec tenancy C-3)', () => {
  it('PO-4: defaults price the lines exactly as today and audit the default source', async () => {
    const h = harness(
      [line(1, 120), line(2, 2_500), line(3, 37)],
      [quote(1, 28_550), quote(2, 1_875), quote(3, 51_235)],
      [],
    )

    await expect(h.convert('req-po-defaults')).resolves.toMatchObject({ status: 'converted' })
    expect(h.lineInserts[0]?.map((value) => value.line_total_cents)).toEqual([
      3_426_000, 4_687_500, 1_895_695,
    ])
    expect(h.poInserts[0]).toMatchObject({
      subtotal_cents: 10_009_195,
      vat_cents: 1_201_103,
      withholding_tax_cents: 200_184,
      total_cents: 11_010_114,
    })
    expect(auditTax(h.audit)).toEqual({
      vatBps: 1200,
      ewtBps: 200,
      source: 'default',
      profileId: null,
      profileCode: null,
      asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
  })

  it('PO-7: a profile with EWT 1% sets the PO tax and the audit source', async () => {
    const h = harness([line(1, 1)], [quote(1, 899_883)], [profileRow({ withholding_rate_bps: 100 })])

    await h.convert('req-po-profile')
    expect(h.poInserts[0]).toMatchObject({
      subtotal_cents: 899_883,
      vat_cents: 107_986,
      withholding_tax_cents: 8_999,
      total_cents: 998_870,
    })
    expect(auditTax(h.audit)).toMatchObject({
      ewtBps: 100,
      source: 'profile',
      profileId: PROFILE_ID,
      profileCode: 'P-2026',
    })
  })

  it('AC-TEN-19: overlapping profiles refuse the conversion and write nothing', async () => {
    const h = harness(
      [line(1, 1)],
      [quote(1, 899_883)],
      [profileRow({ code: 'B' }), profileRow({ code: 'A' })],
    )

    await expect(h.convert('req-po-overlap')).rejects.toBeInstanceOf(ConflictException)
    expect(h.poInserts).toHaveLength(0)
    expect(h.audit.writeSemantic).not.toHaveBeenCalled()
  })
})

describe('requisition-to-PO refuses a retired project', () => {
  it('locks the requisition for conversion only while its project is live', async () => {
    const h = harness([line(1, 1)], [quote(1, 100)], [])

    await h.convert('req-po-live-project')

    const requisitionRead = h.select.mock.results[2]?.value as {
      where: { mock: { calls: unknown[][] } }
    }
    const where = new PgDialect().sqlToQuery(requisitionRead.where.mock.calls[0]?.[0] as SQL).sql
    expect(where).toContain(
      'exists (select "id" from "projects" where ("projects"."id" = "procurement_requisitions"."project_id" and "projects"."tenant_id" = $'
    )
    expect(where).toContain('"projects"."deleted_at" is null')
  })
})
