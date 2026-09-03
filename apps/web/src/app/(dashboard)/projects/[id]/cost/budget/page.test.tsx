import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { boms, costCodes, projects } from '@third-code-erp/database/schema'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  execute: vi.fn(),
  budgetWorkspace: vi.fn(() => null),
}))

vi.mock('@third-code-erp/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.requireUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, execute: mocks.execute },
}))

vi.mock('./budget-workspace', () => ({
  BudgetWorkspace: mocks.budgetWorkspace,
}))

import ProjectBudgetPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

function requireSql(value: SQL | undefined): SQL {
  expect(value).toBeDefined()
  if (!value) throw new Error('Missing budget register query')
  return value
}

describe('ProjectBudgetPage sensitive query planning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.execute.mockResolvedValue([])
  })

  for (const [role, canViewCommercialDetails] of [
    ['finance', false],
    ['viewer', true],
  ] as const) {
    it(`queries only authorized budget domains for ${role}`, async () => {
      const queriedTables: unknown[] = []
      mocks.requireUserProfile.mockResolvedValue({
        tenantId: TENANT_ID,
        role,
      })
      mocks.from.mockImplementation((table: unknown) => {
        queriedTables.push(table)
        if (table === projects) {
          return {
            where: () => ({
              limit: async () => [{ id: PROJECT_ID, name: 'Visible project' }],
            }),
          }
        }
        if (table === costCodes) {
          return { where: () => ({ orderBy: async () => [] }) }
        }
        if (table === boms) {
          return { where: () => ({ orderBy: async () => [] }) }
        }
        throw new Error('Unexpected sensitive table query')
      })

      const page = await ProjectBudgetPage({
        params: Promise.resolve({ id: PROJECT_ID }),
      })
      const markup = renderToStaticMarkup(page)

      expect(queriedTables).toEqual([
        projects,
        costCodes,
        ...(canViewCommercialDetails ? [boms] : []),
      ])
      expect(mocks.execute).toHaveBeenCalledOnce()
      const query = new PgDialect().sqlToQuery(
        requireSql(mocks.execute.mock.calls[0]?.[0]),
      )
      expect(query.sql).not.toContain('public.boms')
      expect(query.sql).not.toContain('public.bom_line_items')
      expect(query.sql).not.toContain('public.po_line_items')
      expect(query.sql).not.toContain('public.purchase_orders')
      if (canViewCommercialDetails) {
        expect(query.sql).toContain('budget.source_bom_id')
      } else {
        expect(query.sql).not.toContain('budget.source_bom_id')
      }
      expect(query.params).toContain(TENANT_ID)
      expect(query.params).toContain(PROJECT_ID)
      expect(mocks.budgetWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          canViewBom: canViewCommercialDetails,
          sourceBoms: [],
          bomLines: [],
        }),
        undefined,
      )
      if (canViewCommercialDetails) {
        expect(markup).toContain('Purchase Orders')
      } else {
        expect(markup).not.toContain('Source BOM')
        expect(markup).not.toContain('Purchase Orders')
        expect(markup).not.toContain('Forecast variance')
      }
    })
  }
})
