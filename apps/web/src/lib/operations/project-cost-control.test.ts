import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { execute: mocks.execute },
}))

import {
  getProjectCostControl,
  getProjectCostControlTotalsForProjects,
} from './project-cost-control'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_A = '33333333-3333-4333-8333-333333333333'
const PROJECT_B = '44444444-4444-4444-8444-444444444444'
const OTHER_PROJECT = '55555555-5555-4555-8555-555555555555'

describe('getProjectCostControl authorization-aware reads', () => {
  beforeEach(() => {
    mocks.execute.mockReset()
    mocks.execute.mockResolvedValue([])
  })

  for (const role of ['Finance', 'Viewer']) {
    it(`issues zero BOM or PO queries for ${role}`, async () => {
      await expect(
        getProjectCostControl({
          tenantId: TENANT_ID,
          projectId: PROJECT_A,
          includeBomDetails: false,
          includePurchaseOrders: false,
        }),
      ).resolves.toEqual({
        rows: [],
        totals: {
          baselineCents: 0,
          committedCents: 0,
          actualCents: 0,
          unreconciledCents: 0,
          forecastCents: 0,
          remainingCents: 0,
          varianceCents: 0,
        },
      })

      expect(mocks.execute).toHaveBeenCalledOnce()
      const query = new PgDialect().sqlToQuery(
        mocks.execute.mock.calls[0]?.[0],
      )
      expect(query.sql).not.toContain('public.bom_line_items')
      expect(query.sql).not.toContain('public.boms')
      expect(query.sql).not.toContain('public.po_line_items')
      expect(query.sql).not.toContain('public.purchase_orders')
      expect(query.sql.match(/entry\.voided_at is null/g)).toHaveLength(1)
      expect(query.params).toContain(TENANT_ID)
      expect(query.params).toContain(PROJECT_A)
    })
  }

  it('keeps PO reads while omitting BOM joins for a PO-only role', async () => {
    await getProjectCostControl({
      tenantId: TENANT_ID,
      projectId: PROJECT_A,
      includeBomDetails: false,
      includePurchaseOrders: true,
    })

    const query = new PgDialect().sqlToQuery(
      mocks.execute.mock.calls[0]?.[0],
    )
    expect(query.sql).toContain('public.po_line_items')
    expect(query.sql).toContain('public.purchase_orders')
    expect(query.sql).not.toContain('public.bom_line_items')
    expect(query.sql.match(/entry\.voided_at is null/g)).toHaveLength(1)
  })
})

describe('getProjectCostControlTotalsForProjects', () => {
  beforeEach(() => {
    mocks.execute.mockReset()
  })

  it('batches BOM-line metrics for requested tenant projects in one query', async () => {
    mocks.execute.mockResolvedValue([
      {
        project_id: PROJECT_A,
        baseline_cents: '100',
        committed_cents: '80',
        actual_cents: '70',
        unreconciled_cents: '5',
      },
      {
        project_id: PROJECT_A,
        baseline_cents: '20',
        committed_cents: '10',
        actual_cents: '30',
        unreconciled_cents: '0',
      },
      {
        project_id: PROJECT_B,
        baseline_cents: '40',
        committed_cents: '10',
        actual_cents: '0',
        unreconciled_cents: '2',
      },
      {
        project_id: OTHER_PROJECT,
        baseline_cents: '999',
        committed_cents: '999',
        actual_cents: '999',
        unreconciled_cents: '999',
      },
    ])

    const totals = await getProjectCostControlTotalsForProjects({
      tenantId: TENANT_ID,
      projectIds: [PROJECT_A, PROJECT_B, PROJECT_A],
    })

    expect(totals.get(PROJECT_A)).toEqual({
      baselineCents: 120,
      committedCents: 90,
      actualCents: 100,
      unreconciledCents: 5,
      forecastCents: 110,
      remainingCents: 10,
      varianceCents: -20,
    })
    expect(totals.get(PROJECT_B)).toEqual({
      baselineCents: 40,
      committedCents: 10,
      actualCents: 0,
      unreconciledCents: 2,
      forecastCents: 10,
      remainingCents: 30,
      varianceCents: -40,
    })
    expect(totals.has(OTHER_PROJECT)).toBe(false)
    expect(mocks.execute).toHaveBeenCalledOnce()

    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]?.[0])
    expect(query.params).toContain(TENANT_ID)
    expect(query.params).toContain(PROJECT_A)
    expect(query.params).toContain(PROJECT_B)
    expect(query.sql.match(/entry\.voided_at is null/g)).toHaveLength(1)
    expect(query.sql).toContain('group by project_id, cost_code_id, bom_line_item_id')
  })

  it('rolls up the greater of commitment and actual per cost-control line', async () => {
    mocks.execute.mockResolvedValue([
      {
        project_id: PROJECT_A,
        baseline_cents: '300000',
        committed_cents: '100000',
        actual_cents: '200000',
        unreconciled_cents: '0',
      },
      {
        project_id: PROJECT_A,
        baseline_cents: '100000',
        committed_cents: '100000',
        actual_cents: '0',
        unreconciled_cents: '0',
      },
    ])

    const totals = await getProjectCostControlTotalsForProjects({
      tenantId: TENANT_ID,
      projectIds: [PROJECT_A],
    })

    expect(totals.get(PROJECT_A)).toEqual({
      baselineCents: 400_000,
      committedCents: 200_000,
      actualCents: 200_000,
      unreconciledCents: 0,
      forecastCents: 300_000,
      remainingCents: 100_000,
      varianceCents: -200_000,
    })
  })

  it('returns no totals and does not query when there are no projects', async () => {
    await expect(
      getProjectCostControlTotalsForProjects({
        tenantId: TENANT_ID,
        projectIds: [],
      })
    ).resolves.toEqual(new Map())

    expect(mocks.execute).not.toHaveBeenCalled()
  })
})

describe('voided manual cost lifecycle projections', () => {
  beforeEach(() => {
    mocks.execute.mockReset()
  })

  it('keeps an active entry once, removes voided-only dimensions, and restores once', async () => {
    const activeAmountCents = 125
    const voidedAmountCents = 900
    const activeRow = {
      cost_code_id: '66666666-6666-4666-8666-666666666666',
      code: 'MAT-01',
      name: 'Materials',
      category: 'material',
      bom_line_item_id: '77777777-7777-4777-8777-777777777777',
      bom_line_code: 'MAT-01',
      bom_line_description: 'Steel frame',
      baseline_cents: '1000',
      committed_cents: '0',
      actual_cents: '0',
      unreconciled_cents: String(activeAmountCents),
    }

    // Each mocked response represents the database result after the query's
    // active-entry predicate: active + voided, voided-only, then restored.
    mocks.execute
      .mockResolvedValueOnce([activeRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([activeRow])

    const active = await getProjectCostControl({
      tenantId: TENANT_ID,
      projectId: PROJECT_A,
    })
    const voided = await getProjectCostControl({
      tenantId: TENANT_ID,
      projectId: PROJECT_A,
    })
    const restored = await getProjectCostControl({
      tenantId: TENANT_ID,
      projectId: PROJECT_A,
    })

    expect(active.rows).toHaveLength(1)
    expect(active.rows[0]?.unreconciledCents).toBe(activeAmountCents)
    expect(active.totals.unreconciledCents).toBe(activeAmountCents)
    expect(active.totals.unreconciledCents).not.toBe(
      activeAmountCents + voidedAmountCents,
    )

    expect(voided).toEqual({
      rows: [],
      totals: {
        baselineCents: 0,
        committedCents: 0,
        actualCents: 0,
        unreconciledCents: 0,
        forecastCents: 0,
        remainingCents: 0,
        varianceCents: 0,
      },
    })

    expect(restored.rows).toHaveLength(1)
    expect(restored.rows[0]?.key).toBe(active.rows[0]?.key)
    expect(restored.totals.unreconciledCents).toBe(activeAmountCents)

    for (const call of mocks.execute.mock.calls) {
      const query = new PgDialect().sqlToQuery(call[0])
      expect(query.sql.match(/entry\.voided_at is null/g)).toHaveLength(1)
    }
  })
})
