import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
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

function harness(featureKey: string, selectRows: unknown[][], updated: (values: Row) => Row | undefined) {
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
        // A fresh create reads the inserted requisition back through returning().
        return chain([{ id: REQUISITION_ID, ...values }])
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Row) => {
        updates.push(values)
        const row = updated(values)
        return chain(row ? [row] : [])
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
  return { service, updates, inserts, audit, select, transactionClient, expectNothingWritten }
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

const OTHER_REQUISITION_ID = '77777777-7777-4777-8777-777777777777'

type RequisitionCommand = {
  action: 'submit' | 'approve' | 'reject' | 'cancel'
  reason?: string
}

// Select order: principal, prior requisition event, requisition FOR UPDATE (or replay target), line count.
function requisitionCommand(
  command: RequisitionCommand,
  principal: ErpPrincipal,
  row: Row,
  priorEvent: Row[] = [],
  updated: (values: Row) => Row | undefined = (values) => ({ ...row, ...values }),
) {
  const h = harness('ERP_ROADMAP_PROCUREMENT_LIFECYCLE_ENABLED', [[{ id: principal.userId }], priorEvent, [row], [{ count: 1 }]], updated)
  return { ...h, run: () => h.service.transitionRequisition(REQUISITION_ID, command, principal, 'req-key') }
}

// The event row as the key lookup reads it back.
function asPriorEvent(event: Row): Row {
  expect(event.request_hash).toMatch(/^[0-9a-f]{64}$/)
  return {
    requisitionId: event.requisition_id,
    action: event.action,
    actorId: event.actor_id,
    requestHash: event.request_hash,
    reason: event.reason,
  }
}

// Runs a command once and returns its event, ready to be replayed.
async function recordedEvent(command: RequisitionCommand, principal: ErpPrincipal, row: Row): Promise<Row> {
  const first = requisitionCommand(command, principal, row)
  await first.run()
  return asPriorEvent(first.inserts[0]!)
}

const OTHER_APPROVER: ErpPrincipal = { ...CHECKER, userId: '88888888-8888-4888-8888-888888888888' }
const REQUESTER: ErpPrincipal = { ...CHECKER, userId: MAKER_ID, role: 'pm' }

async function expectKeyConflict(run: () => Promise<unknown>, h: { select: ReturnType<typeof vi.fn>; expectNothingWritten: () => void }) {
  const result = run()
  await expect(result).rejects.toBeInstanceOf(ConflictException)
  await expect(result).rejects.toThrow('Idempotency key was already used for another workflow command')
  // Principal and key lookup only: refused before the requisition is read.
  expect(h.select).toHaveBeenCalledTimes(2)
  h.expectNothingWritten()
}

describe('requisition retry keys', () => {
  it('replays the same command by the same actor without writing', async () => {
    const prior = await recordedEvent({ action: 'approve' }, CHECKER, requisition())
    const h = requisitionCommand(
      { action: 'approve' },
      CHECKER,
      requisition({ status: 'approved', approved_by: CHECKER.userId }),
      [prior],
    )

    await expect(h.run()).resolves.toMatchObject({ requisitionId: REQUISITION_ID, status: 'approved', created: false })
    h.expectNothingWritten()
  })

  it.each([
    ['another requisition', { requisitionId: OTHER_REQUISITION_ID }],
    ['another action', { action: 'reject' }],
    ['another actor', { actorId: OTHER_APPROVER.userId }],
    ['another payload', { requestHash: 'f'.repeat(64) }],
    ['an event stored before request hashes', { requestHash: null }],
  ])('refuses a key already used for %s instead of replaying it', async (_case, change) => {
    const prior = await recordedEvent({ action: 'approve' }, CHECKER, requisition())
    const h = requisitionCommand({ action: 'approve' }, CHECKER, requisition(), [{ ...prior, ...change }])

    await expectKeyConflict(h.run, h)
  })

  it('refuses a rejection retried with another reason', async () => {
    const prior = await recordedEvent({ action: 'reject', reason: 'Over budget' }, CHECKER, requisition())
    const h = requisitionCommand({ action: 'reject', reason: 'Wrong supplier' }, CHECKER, requisition({ status: 'rejected' }), [prior])

    await expectKeyConflict(h.run, h)
  })

  it("refuses another user's submit key instead of replaying the requester's result", async () => {
    const prior = await recordedEvent({ action: 'submit' }, REQUESTER, requisition({ status: 'draft' }))
    const h = requisitionCommand({ action: 'submit' }, CHECKER, requisition(), [prior])

    await expectKeyConflict(h.run, h)
  })

  it('locks the tenant before reading the key and scopes every read and the update to the tenant', async () => {
    const h = requisitionCommand({ action: 'approve' }, CHECKER, requisition())
    await h.run()

    const dialect = new PgDialect()
    const lock = dialect.sqlToQuery(h.transactionClient.execute.mock.calls[0]?.[0] as SQL)
    expect(lock.sql).toContain('pg_advisory_xact_lock')
    expect(lock.params).toContain(`roadmap:${TENANT_ID}`)
    expect(h.transactionClient.execute.mock.invocationCallOrder[0]).toBeLessThan(h.select.mock.invocationCallOrder[1]!)
    // Principal, key lookup, requisition FOR UPDATE and line count.
    expect(h.select.mock.results).toHaveLength(4)
    for (const result of h.select.mock.results) {
      const node = result.value as { where: ReturnType<typeof vi.fn> }
      expect(dialect.sqlToQuery(node.where.mock.calls[0]?.[0] as SQL).params).toContain(TENANT_ID)
    }
    const update = h.transactionClient.update.mock.results[0]?.value as { set: ReturnType<typeof vi.fn> }
    const updated = update.set.mock.results[0]?.value as { where: ReturnType<typeof vi.fn> }
    // The update applies only while the row is still in the status that was checked.
    expect(dialect.sqlToQuery(updated.where.mock.calls[0]?.[0] as SQL).params).toEqual([REQUISITION_ID, TENANT_ID, 'pending_approval'])
  })

  it('refuses with 409 and records no event when the guarded update changes no row', async () => {
    const h = requisitionCommand({ action: 'approve' }, CHECKER, requisition(), [], () => undefined)

    const result = h.run()
    await expect(result).rejects.toBeInstanceOf(ConflictException)
    await expect(result).rejects.toThrow('The requisition changed while this command ran')
    expect(h.inserts).toHaveLength(0)
    expect(h.audit.writeSemantic).not.toHaveBeenCalled()
  })
})

const PROJECT_ID = '66666666-6666-4666-8666-666666666666'
const CREATE = {
  projectId: PROJECT_ID,
  purpose: 'Level 3 ceiling board',
  currency: 'PHP',
  lines: [{ description: 'Gypsum board 12mm', quantityMicros: '40000000', estimatedUnitCostCents: '45000' }],
}

// Fresh create select order: principal, key lookup, project, requisition count, result line count.
// Replay select order: principal, key lookup, replay target, result line count.
function createRequisition(command: typeof CREATE, principal: ErpPrincipal, priorEvent: Row[] = []) {
  const rows = priorEvent.length
    ? [[{ id: principal.userId }], priorEvent, [requisition({ status: 'draft' })], [{ count: 1 }]]
    : [[{ id: principal.userId }], [], [{ id: PROJECT_ID }], [{ count: '0' }], [{ count: 1 }]]
  const h = harness('ERP_ROADMAP_PROCUREMENT_LIFECYCLE_ENABLED', rows, (values) => values)
  return { ...h, run: () => h.service.createRequisition(command, principal, 'create-key') }
}

async function recordedCreate(principal: ErpPrincipal): Promise<Row> {
  const first = createRequisition(CREATE, principal)
  await expect(first.run()).resolves.toMatchObject({ created: true })
  return asPriorEvent(first.inserts.find((values) => values.action === 'create')!)
}

describe('requisition create retry keys', () => {
  it('replays the same create by the same requester', async () => {
    const prior = await recordedCreate(REQUESTER)
    const h = createRequisition(CREATE, REQUESTER, [prior])

    await expect(h.run()).resolves.toMatchObject({ requisitionId: REQUISITION_ID, created: false })
    h.expectNothingWritten()
  })

  it('still replays a create event that kept its hash only in reason', async () => {
    const prior = await recordedCreate(REQUESTER)
    const h = createRequisition(CREATE, REQUESTER, [{ ...prior, requestHash: null }])

    await expect(h.run()).resolves.toMatchObject({ created: false })
    h.expectNothingWritten()
  })

  it.each([
    ['another payload', { ...CREATE, purpose: 'Level 4 ceiling board' }, REQUESTER, {}],
    ['another requester', CREATE, OTHER_APPROVER, {}],
    ['a workflow command', CREATE, REQUESTER, { action: 'approve' }],
  ])('refuses a create key already used for %s', async (_case, command, principal, change) => {
    const prior = await recordedCreate(REQUESTER)
    const h = createRequisition(command, principal, [{ ...prior, ...change }])

    await expectKeyConflict(h.run, h)
  })
})

describe('requisition status guards', () => {
  it.each([
    ['submit', REQUESTER, 'pending_approval'],
    ['cancel', REQUESTER, 'approved'],
    ['cancel', CHECKER, 'converted'],
  ] as const)('refuses %s by a permitted user from %s', async (action, principal, status) => {
    const h = requisitionCommand({ action }, principal, requisition({ status }))

    const result = h.run()
    await expect(result).rejects.toBeInstanceOf(ConflictException)
    await expect(result).rejects.toThrow(`Requisition cannot perform ${action} from status ${status}`)
    h.expectNothingWritten()
  })
})

describe('requisition ownership', () => {
  it('refuses a submit by anyone but the requester', async () => {
    const h = requisitionCommand({ action: 'submit' }, CHECKER, requisition({ status: 'draft' }))

    const result = h.run()
    await expect(result).rejects.toBeInstanceOf(ForbiddenException)
    await expect(result).rejects.toThrow('Only the requester can submit their requisition')
    h.expectNothingWritten()
  })

  it('lets the requester submit a draft', async () => {
    const requester = { ...CHECKER, userId: MAKER_ID, role: 'pm' as const }
    const h = requisitionCommand({ action: 'submit' }, requester, requisition({ status: 'draft' }))

    await expect(h.run()).resolves.toMatchObject({ status: 'pending_approval' })
  })

  it('refuses a cancel by a non-requester without PO approval', async () => {
    const h = requisitionCommand({ action: 'cancel' }, { ...CHECKER, role: 'pm' }, requisition())

    const result = h.run()
    await expect(result).rejects.toBeInstanceOf(ForbiddenException)
    await expect(result).rejects.toThrow('Only the requester or a PO approver can cancel a requisition')
    h.expectNothingWritten()
  })

  it.each([
    ['the requester', { ...CHECKER, userId: MAKER_ID, role: 'pm' as const }],
    ['a PO approver', CHECKER],
  ])('lets %s cancel', async (_case, principal) => {
    const h = requisitionCommand({ action: 'cancel' }, principal, requisition())

    await expect(h.run()).resolves.toMatchObject({ status: 'cancelled' })
    expect(h.inserts[0]).toMatchObject({ action: 'cancel', actor_id: principal.userId })
  })
})
