import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@third-code-erp/database', () => ({ db: { execute: mocks.execute } }))

import { loadBudgetDraft } from './draft-query'

const tenantId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const budgetId = '33333333-3333-4333-8333-333333333333'

describe('coherent editable budget snapshot', () => {
  beforeEach(() => vi.resetAllMocks())

  it('loads header, exact version and ordered lines in one tenant/project-scoped statement', async () => {
    const draft = {
      id: budgetId, revision: 1, version: '123456:1789320000.123456',
      sourceBomId: null, controlMode: 'warn', toleranceBps: 0,
      currency: 'PHP', effectiveFrom: '2026-09-13', reason: 'Initial baseline',
      lines: [],
    }
    mocks.execute.mockResolvedValue([draft])
    expect(await loadBudgetDraft(tenantId, projectId, budgetId, true)).toEqual(draft)
    expect(mocks.execute).toHaveBeenCalledOnce()
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0])
    expect(query.sql).toContain('budget.xmin::text')
    expect(query.sql).toContain('extract(epoch from budget.updated_at)::text')
    expect(query.sql).toContain('public.project_budget_lines')
    expect(query.sql).toContain('order by line.line_number')
    expect(query.sql).toContain("budget.status = 'draft'")
    expect(query.sql).toContain('line.tenant_id = budget.tenant_id')
    expect(query.params).toEqual(expect.arrayContaining([tenantId, projectId, budgetId]))
  })

  it('does not query hidden BOM associations for Finance', async () => {
    mocks.execute.mockResolvedValue([])
    expect(await loadBudgetDraft(tenantId, projectId, budgetId, false)).toBeNull()
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0])
    expect(query.sql).not.toContain('budget.source_bom_id')
    expect(query.sql).not.toContain('line.bom_line_item_id')
  })
})
