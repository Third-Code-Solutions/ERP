import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { boms, costCodes, costEntries, projectBudgets, projects } from '@third-code-erp/database/schema'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  getProjectCostControl: vi.fn(),
  costControlTable: vi.fn(() => null),
}))

vi.mock('@third-code-erp/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.requireUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('@/lib/operations/project-cost-control', () => ({
  getProjectCostControl: mocks.getProjectCostControl,
}))

vi.mock('@/components/cost/gp-erosion-badge', () => ({ GpErosionBadge: () => null }))
vi.mock('@/components/cost/cost-entry-form', () => ({ CostEntryForm: () => null }))
vi.mock('@/components/cost/cost-table', () => ({ CostTable: () => null }))
vi.mock('@/components/cost/cost-control-table', () => ({
  CostControlTable: mocks.costControlTable,
}))

import ProjectCostPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('ProjectCostPage sensitive query planning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.getProjectCostControl.mockResolvedValue({
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
  })

  for (const role of ['finance', 'viewer'] as const) {
    it(`skips BOM and PO detail queries for ${role}`, async () => {
      const queriedTables: unknown[] = []
      mocks.requireUserProfile.mockResolvedValue({
        tenantId: TENANT_ID,
        role,
      })
      mocks.from.mockImplementation((table: unknown) => {
        queriedTables.push(table)
        if (table === projects) return { where: async () => [{ id: PROJECT_ID }] }
        if (table === projectBudgets) {
          return { where: () => ({ limit: async () => [] }) }
        }
        if (table === costEntries || table === costCodes) {
          return { where: () => ({ orderBy: async () => [] }) }
        }
        throw new Error('Unexpected sensitive table query')
      })

      const page = await ProjectCostPage({
        params: Promise.resolve({ id: PROJECT_ID }),
      })
      const markup = renderToStaticMarkup(page)

      expect(queriedTables).toEqual([
        projects,
        projectBudgets,
        costEntries,
        costCodes,
      ])
      expect(queriedTables).not.toContain(boms)
      expect(mocks.getProjectCostControl).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        includeBomDetails: false,
        includePurchaseOrders: false,
      })
      expect(mocks.costControlTable).toHaveBeenCalledWith(
        expect.objectContaining({
          showBomDetails: false,
          showCommitments: false,
        }),
        undefined,
      )
      expect(markup).toContain('Approved budget and posted actuals by Cost Code.')
      expect(markup).not.toContain('BOM')
      expect(markup).not.toContain('PO Committed')
      expect(markup).not.toContain('Budget Variance')
    })
  }
})
