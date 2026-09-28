import { beforeEach, describe, expect, it, vi } from 'vitest'

const auditMock = vi.hoisted(() => ({
  writeAwardAuditInTransaction: vi.fn(),
}))
const databaseMock = vi.hoisted(() => ({
  db: { transaction: vi.fn() },
}))
const sharedTypesMock = vi.hoisted(() => ({
  createSlaClockSchedule: vi.fn(() => ({
    clock_type: 'business_days',
    clock_scope: 'internal',
    target_value: 2,
    started_at: new Date('2026-01-01T00:00:00.000Z'),
    due_at: new Date('2026-01-05T00:00:00.000Z'),
    at_risk_at: null,
    escalation_at: null,
    observe_mode: true,
  })),
}))

vi.mock('@third-code-erp/database', () => databaseMock)
vi.mock('@third-code-erp/database/schema', () => {
  const makeTable = () =>
    new Proxy<Record<string, unknown>>(
      {},
      { get: (_target, property: string | symbol) => property.toString() },
    )
  return {
    awardHandoffs: makeTable(),
    boms: makeTable(),
    bomLineItems: makeTable(),
    costCodes: makeTable(),
    invoices: makeTable(),
    masterSchedules: makeTable(),
    mobilizationReadiness: makeTable(),
    opportunities: makeTable(),
    processSteps: makeTable(),
    projectBudgetLines: makeTable(),
    projectBudgets: makeTable(),
    projects: makeTable(),
    slaClocks: makeTable(),
    taskInstances: makeTable(),
    users: makeTable(),
    boqDivisions: makeTable(),
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}))
vi.mock('./audit', () => auditMock)
vi.mock('@third-code-erp/shared-types', () => sharedTypesMock)
vi.mock('./business-calendar', () => ({
  resolveAwardBusinessDayService: vi.fn(),
}))

import {
  runSignedBomAward,
  selectSignedBomAwardLines,
  type SignedBomAwardLine,
} from './signed-bom-award'

function line(overrides: Partial<SignedBomAwardLine>): SignedBomAwardLine {
  return {
    id: 'line-1',
    description: 'Concrete work',
    kind: 'work_item',
    lineTotalCents: 1_000,
    divisionCode: '01',
    divisionName: 'General',
    parentLineItemId: null,
    classificationStatus: 'classified',
    isGroup: 0,
    ...overrides,
  }
}

describe('selectSignedBomAwardLines', () => {
  it('keeps the priced parent and excludes its attached material child', () => {
    const rows = [
      line({ id: 'parent', lineTotalCents: 10_000 }),
      line({
        id: 'material-child',
        kind: 'material_line',
        description: 'Cement',
        lineTotalCents: 4_000,
        parentLineItemId: 'parent',
      }),
    ]

    const selected = selectSignedBomAwardLines(rows)

    expect(selected).toHaveLength(1)
    expect(selected[0]).toMatchObject({ id: 'parent', lineTotalCents: 10_000 })
  })

  it('keeps multiple top-level parents and standalone work items in source order', () => {
    const rows = [
      line({ id: 'parent-a', lineTotalCents: 1_000 }),
      line({
        id: 'material-a',
        kind: 'material_line',
        lineTotalCents: 200,
        parentLineItemId: 'parent-a',
      }),
      line({ id: 'parent-b', lineTotalCents: 2_000 }),
      line({ id: 'standalone', lineTotalCents: 3_000 }),
    ]

    const selected = selectSignedBomAwardLines(rows)

    expect(selected.map((item) => item.id)).toEqual(['parent-a', 'parent-b', 'standalone'])
    expect(selected.reduce((total, item) => total + item.lineTotalCents, 0)).toBe(6_000)
  })

  it('rejects an orphan material row before producing a budget baseline', () => {
    expect(() =>
      selectSignedBomAwardLines([
        line({ id: 'orphan', kind: 'material_line', parentLineItemId: 'missing' }),
      ]),
    ).toThrow('Signed BOM contains an orphan material line')
  })

  it('rejects unresolved hierarchy rows', () => {
    expect(() =>
      selectSignedBomAwardLines([line({ id: 'review', classificationStatus: 'review' })]),
    ).toThrow('Signed BOM contains unresolved line items')
  })
})

type SelectResult = readonly unknown[]

class SelectChain implements PromiseLike<SelectResult> {
  constructor(private readonly result: SelectResult) {}

  from(): this {
    return this
  }

  leftJoin(): this {
    return this
  }

  where(): this {
    return this
  }

  orderBy(): this {
    return this
  }

  limit(): this {
    return this
  }

  then<TResult1 = SelectResult, TResult2 = never>(
    onfulfilled?: ((value: SelectResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected)
  }
}

class WriteChain implements PromiseLike<readonly unknown[]> {
  constructor(
    private readonly result: readonly unknown[] = [],
    private readonly onValues?: (values: unknown) => WriteChain,
  ) {}

  set(): this {
    return this
  }

  where(): this {
    return this
  }

  values(values: unknown): WriteChain {
    return this.onValues ? this.onValues(values) : this
  }

  returning(): PromiseLike<readonly unknown[]> {
    return Promise.resolve(this.result)
  }

  then<TResult1 = readonly unknown[], TResult2 = never>(
    onfulfilled?: ((value: readonly unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected)
  }
}

type AwardTransaction = Parameters<typeof runSignedBomAward>[0]

function asAwardTransaction(value: object): AwardTransaction {
  return value as AwardTransaction
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

describe('runSignedBomAward hierarchy validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reconciles recorded NTP on an idempotent award retry without repeating award writes', async () => {
    const handoff = {
      id: 'handoff-1',
      status: 'active',
      project_id: 'project-1',
      project_code: 'PRJ-2026-0001',
      budget_id: 'budget-1',
      dp_invoice_id: 'invoice-1',
      project_tracker_id: 'tracker-1',
      task_ids: {
        arProjectCode: 'task-ar',
        downPaymentInvoice: 'task-dp',
        cari: 'task-cari',
        projectTracker: 'task-tracker',
        cxOnboarding: 'task-cx',
      },
    }
    const selectResults: SelectResult[] = [[{ projectId: 'project-1' }], [], [handoff], []]
    const select = vi.fn(() => {
      const result = selectResults.shift()
      if (!result) throw new Error('unexpected select')
      return new SelectChain(result)
    })
    const execute = vi.fn(async () => [])
    const insert = vi.fn()
    const update = vi.fn()

    const result = await runSignedBomAward(
      asAwardTransaction({ execute, select, insert, update }),
      { tenantId: 'tenant-1', bomId: 'bom-1', actorId: null },
    )

    expect(result).toMatchObject({ handoffId: handoff.id, reused: true })
    expect(select).toHaveBeenCalledTimes(4)
    expect(execute).toHaveBeenCalledTimes(4)
    expect(insert).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an orphan before opportunity, project, budget, or audit writes', async () => {
    const selectResults: SelectResult[] = [
      [{ projectId: 'project-1' }],
      [],
      [],
      [
        {
          id: 'bom-1',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          opportunityId: null,
          status: 'locked',
          tcvCents: 100_000,
        },
      ],
      [{ id: 'project-1', accountId: null, projectCode: 'PRJ-2026-0001' }],
      [],
      [
        line({ id: 'parent', lineTotalCents: 10_000 }),
        line({ id: 'orphan', kind: 'material_line', parentLineItemId: 'missing' }),
      ],
    ]
    const select = vi.fn(() => {
      const result = selectResults.shift()
      if (!result) throw new Error('unexpected select')
      return new SelectChain(result)
    })
    const execute = vi.fn(async () => [])
    const update = vi.fn()
    const insert = vi.fn()

    await expect(
      runSignedBomAward(
        asAwardTransaction({ execute, select, update, insert }),
        { tenantId: 'tenant-1', bomId: 'bom-1', actorId: null },
      ),
    ).rejects.toThrow('Signed BOM contains an orphan material line')

    expect(update).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
    expect(auditMock.writeAwardAuditInTransaction).not.toHaveBeenCalled()
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it('creates one budget line for the parent amount, not the attached material amount', async () => {
    const selectResults: SelectResult[] = [
      [{ projectId: 'project-1' }],
      [],
      [],
      [
        {
          id: 'bom-1',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          opportunityId: null,
          status: 'locked',
          tcvCents: 100_000,
        },
      ],
      [{ id: 'project-1', accountId: null, projectCode: 'PRJ-2026-0001' }],
      [],
      [
        line({ id: 'parent', lineTotalCents: 10_000 }),
        line({
          id: 'material-child',
          kind: 'material_line',
          description: 'Cement',
          lineTotalCents: 4_000,
          parentLineItemId: 'parent',
        }),
      ],
      [{ id: 'creator-1' }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]
    const select = vi.fn(() => {
      const result = selectResults.shift()
      if (!result) throw new Error('unexpected select')
      return new SelectChain(result)
    })
    const execute = vi.fn(async () => [])
    const insertedValues: unknown[] = []
    const insert = vi.fn(
      () =>
        new WriteChain([], (values) => {
          insertedValues.push(values)
          const record = objectRecord(values)
          if (record && 'source_bom_id' in record) {
            return new WriteChain([{ id: 'budget-1' }])
          }
          if (record && 'invoice_number' in record) {
            return new WriteChain([{ id: 'invoice-1' }])
          }
          if (record?.name === 'Project Tracker') {
            return new WriteChain([{ id: 'tracker-1' }])
          }
          if (typeof record?.code === 'string' && record.code.startsWith('AWD-')) {
            return new WriteChain([{ id: 'cost-code-1' }])
          }
          if (typeof record?.code === 'string' && record.code.startsWith('AWARD.')) {
            return new WriteChain([{ id: record.code, slaDays: record.code === 'AWARD.CX_ONBOARDING' ? 7 : 2 }])
          }
          return new WriteChain()
        }),
    )
    const update = vi.fn(() => new WriteChain())

    const result = await runSignedBomAward(
      asAwardTransaction({ execute, select, update, insert }),
      { tenantId: 'tenant-1', bomId: 'bom-1', actorId: null, downPaymentBps: 2_500 },
    )

    const budgetLineInsert = insertedValues.find(
      (values) =>
        Array.isArray(values) &&
        values.some(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            'bom_line_item_id' in value,
        ),
    )
    const invoiceInsert = insertedValues.find((values) => {
      const record = objectRecord(values)
      return record?.invoice_number === 'AWD-DP-PRJ-2026-0001'
    })
    expect(result.budgetId).toBe('budget-1')
    expect(budgetLineInsert).toEqual([
      expect.objectContaining({
        bom_line_item_id: 'parent',
        amount_cents: 10_000,
      }),
    ])
    expect(invoiceInsert).toEqual(
      expect.objectContaining({
        subtotal_cents: 25_000,
        net_amount_cents: 25_000,
      }),
    )
    expect(sharedTypesMock.createSlaClockSchedule).toHaveBeenCalled()
    expect(auditMock.writeAwardAuditInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: null,
        entityType: 'award_handoff',
        action: 'create',
      })
    )
  })
})
