import { beforeEach, describe, expect, it, vi } from 'vitest'

const auditMock = vi.hoisted(() => ({
  writeAuditLogInTransaction: vi.fn(),
}))
const databaseMock = vi.hoisted(() => ({
  db: { transaction: vi.fn() },
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
vi.mock('@/lib/audit', () => auditMock)
vi.mock('@third-code-erp/shared-types', () => ({
  createSlaClockSchedule: vi.fn(),
}))
vi.mock('./business-calendar', () => ({
  resolveTenantBusinessDayService: vi.fn(),
}))

import {
  runSignedBomAward,
  selectSignedBomAwardLines,
  type SignedBomAwardLine,
} from './award-automation'

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

type AwardTransaction = Parameters<typeof runSignedBomAward>[0]

function asAwardTransaction(value: object): AwardTransaction {
  return value as AwardTransaction
}

describe('runSignedBomAward hierarchy validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an orphan before opportunity, project, budget, or audit writes', async () => {
    const selectResults: SelectResult[] = [
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
    expect(auditMock.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
