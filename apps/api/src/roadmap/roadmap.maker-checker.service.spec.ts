import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { RoadmapService } from './roadmap.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const MAKER_ID = '33333333-3333-4333-8333-333333333333'
const CHECKER: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
  role: 'commercial',
  email: 'checker@example.test',
}
const PRICE_LIST_ID = '44444444-4444-4444-8444-444444444444'
const REQUISITION_ID = '55555555-5555-4555-8555-555555555555'

type Row = Record<string, unknown>

// Every Drizzle builder step returns the same node; awaiting it yields rows.
function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  }
  for (const method of ['from', 'where', 'limit', 'for', 'orderBy', 'returning']) {
    node[method] = vi.fn(() => node)
  }
  return node
}

function harness(featureKey: string, selectRows: unknown[][], updated: (values: Row) => Row) {
  const select = vi.fn()
  for (const rows of selectRows) select.mockReturnValueOnce(chain(rows))
  const updates: Row[] = []
  const inserts: Row[] = []
  const transactionClient = {
    select,
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(() => ({
      values: vi.fn((values: Row) => {
        inserts.push(values)
        return chain([])
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Row) => {
        updates.push(values)
        return chain([updated(values)])
      }),
    })),
  }
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
  const config = { get: vi.fn((key: string) => key === featureKey) } as unknown as ConfigService
  const service = new RoadmapService(
    config,
    {
      client: {
        transaction: async (callback: (tx: unknown) => unknown) => callback(transactionClient),
      },
    } as unknown as DatabaseService,
    audit as unknown as AuditService,
  )
  const expectNothingWritten = () => {
    expect(updates).toHaveLength(0)
    expect(inserts).toHaveLength(0)
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  }
  return { service, updates, inserts, audit, select, expectNothingWritten }
}

function priceList(overrides: Row = {}): Row {
  return {
    id: PRICE_LIST_ID,
    tenant_id: TENANT_ID,
    code: 'PL-2027',
    status: 'draft',
    created_by: MAKER_ID,
    approved_by: null,
    approved_at: null,
    ...overrides,
  }
}

// Select order: principal, prior workflow event, price list FOR UPDATE, item count.
function priceListTransition(list: Row, action: 'activate' | 'retire', principal = CHECKER) {
  const h = harness(
    'ERP_ROADMAP_PRICE_LISTS_ENABLED',
    [[{ id: principal.userId }], [], [list], [{ count: 2 }]],
    (values) => ({ ...list, ...values }),
  )
  return { ...h, run: () => h.service.transitionPriceList(PRICE_LIST_ID, { action }, principal, `pl-${action}`) }
}

describe('price list maker-checker and state machine', () => {
  it('refuses activation by the user who prepared the list and writes nothing', async () => {
    const h = priceListTransition(priceList({ created_by: CHECKER.userId }), 'activate')

    const result = h.run()
    await expect(result).rejects.toBeInstanceOf(ForbiddenException)
    await expect(result).rejects.toThrow('The price list preparer cannot activate it')
    h.expectNothingWritten()
  })

  it.each([
    ['activate', 'active', 'Only a draft price list can be activated'],
    ['activate', 'retired', 'Only a draft price list can be activated'],
    ['retire', 'draft', 'Only an active price list can be retired'],
    ['retire', 'retired', 'Only an active price list can be retired'],
  ] as const)('refuses to %s a %s list', async (action, status, message) => {
    const h = priceListTransition(priceList({ status }), action)

    const result = h.run()
    await expect(result).rejects.toBeInstanceOf(ConflictException)
    await expect(result).rejects.toThrow(message)
    h.expectNothingWritten()
  })

  it('lets a different approver activate a draft and records them', async () => {
    const h = priceListTransition(priceList(), 'activate')

    await expect(h.run()).resolves.toMatchObject({ priceListId: PRICE_LIST_ID, status: 'active' })
    expect(h.updates[0]).toMatchObject({ status: 'active', approved_by: CHECKER.userId })
    expect(h.audit.writeSemantic).toHaveBeenCalledTimes(1)
  })

  it('lets the preparer retire an active list without changing its approver', async () => {
    const approvedAt = new Date('2026-11-01T00:00:00Z')
    const h = priceListTransition(
      priceList({ status: 'active', created_by: CHECKER.userId, approved_by: MAKER_ID, approved_at: approvedAt }),
      'retire',
    )

    await expect(h.run()).resolves.toMatchObject({ status: 'retired' })
    expect(h.updates[0]).toMatchObject({ status: 'retired', approved_by: MAKER_ID, approved_at: approvedAt })
  })
})

function requisition(overrides: Row = {}): Row {
  return {
    id: REQUISITION_ID,
    tenant_id: TENANT_ID,
    project_id: '66666666-6666-4666-8666-666666666666',
    requester_id: MAKER_ID,
    requisition_number: 'REQ-0001',
    status: 'pending_approval',
    estimated_total_cents: 0n,
    approved_by: null,
    approved_at: null,
    converted_purchase_order_id: null,
    ...overrides,
  }
}

// Select order: principal, prior requisition event, requisition FOR UPDATE, result line count.
function requisitionDecision(
  action: 'approve' | 'reject',
  principal: ErpPrincipal,
  row: Row = requisition(),
) {
  const h = harness(
    'ERP_ROADMAP_PROCUREMENT_LIFECYCLE_ENABLED',
    [[{ id: principal.userId }], [], [row], [{ count: 1 }]],
    (values) => ({ ...row, ...values }),
  )
  const command = action === 'reject' ? { action, reason: 'Over budget' } : { action }
  return { ...h, run: () => h.service.transitionRequisition(REQUISITION_ID, command, principal, `req-${action}`) }
}

describe('requisition approval authority', () => {
  it.each(['pm', 'procurement', 'sd_pm_pe'] as const)(
    'refuses %s, which may raise requisitions but not approve them, before any read',
    async (role) => {
      for (const action of ['approve', 'reject'] as const) {
        const h = requisitionDecision(action, { ...CHECKER, role })

        const result = h.run()
        await expect(result).rejects.toBeInstanceOf(ForbiddenException)
        await expect(result).rejects.toThrow('PO approval capability is required')
        expect(h.select).not.toHaveBeenCalled()
        h.expectNothingWritten()
      }
    },
  )

  it('refuses the requester approving their own requisition', async () => {
    const h = requisitionDecision('approve', CHECKER, requisition({ requester_id: CHECKER.userId }))

    const result = h.run()
    await expect(result).rejects.toBeInstanceOf(ForbiddenException)
    await expect(result).rejects.toThrow('The requester cannot approve their own requisition')
    h.expectNothingWritten()
  })

  it('lets a different approver approve and records them', async () => {
    const h = requisitionDecision('approve', CHECKER)

    await expect(h.run()).resolves.toMatchObject({ requisitionId: REQUISITION_ID, status: 'approved' })
    expect(h.updates[0]).toMatchObject({ status: 'approved', approved_by: CHECKER.userId })
  })

  it('lets an approver reject with a reason', async () => {
    const h = requisitionDecision('reject', CHECKER)

    await expect(h.run()).resolves.toMatchObject({ status: 'rejected' })
    expect(h.inserts[0]).toMatchObject({ action: 'reject', reason: 'Over budget', actor_id: CHECKER.userId })
  })
})
