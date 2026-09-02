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
    expect(query.sql).toContain('group by project_id, cost_code_id, bom_line_item_id')
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
