import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { boms, invoices, projects } from '@third-code-erp/database/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
  can: (role: string, capability: string) =>
    [
      'project.read',
      'opportunity.read',
      'finance.read',
      'budget.read',
      'audit.read',
    ].includes(capability) ||
    (role === 'finance' && capability === 'finance.issue_invoice'),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('@/components/billing/create-invoice-form', () => ({
  CreateInvoiceForm: () => <button>Issue invoice</button>,
}))

import ProjectBillingPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

function requireSql(value: SQL | undefined): SQL {
  expect(value).toBeDefined()
  if (!value) throw new Error('Missing invoice filter condition')
  return value
}

describe('ProjectBillingPage authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'finance',
    })
    mocks.select.mockReturnValue({ from: mocks.from })
  })

  it('does not query BOM data when the billing reader lacks BOM access', async () => {
    const queriedTables: unknown[] = []
    let invoiceCondition: SQL | undefined
    mocks.from.mockImplementation((table: unknown) => {
      queriedTables.push(table)
      if (table === projects) {
        return {
          where: async () => [{ id: PROJECT_ID, name: 'Visible project' }],
        }
      }
      if (table === invoices) {
        return {
          where: (condition: SQL) => {
            invoiceCondition = condition
            return { orderBy: async () => [] }
          },
        }
      }
      throw new Error('Unexpected query in billing page test')
    })

    await expect(
      ProjectBillingPage({ params: Promise.resolve({ id: PROJECT_ID }) }),
    ).resolves.toBeTruthy()

    expect(mocks.requireCapability).not.toHaveBeenCalled()
    expect(queriedTables).toEqual([projects, invoices])
    expect(queriedTables).not.toContain(boms)

    const dialect = new PgDialect()
    const query = dialect.sqlToQuery(requireSql(invoiceCondition))
    expect(query.sql).toContain('"invoices"."project_id"')
    expect(query.sql).toContain('"invoices"."tenant_id"')
    expect(query.params).toContain(PROJECT_ID)
    expect(query.params).toContain(TENANT_ID)
  })

  it('renders invoices without the issue-invoice control for Viewer', async () => {
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'viewer',
    })
    mocks.from.mockImplementation((table: unknown) => {
      if (table === projects) {
        return { where: async () => [{ id: PROJECT_ID, name: 'Visible project' }] }
      }
      if (table === invoices) {
        return { where: () => ({ orderBy: async () => [] }) }
      }
      if (table === boms) {
        return { where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }
      }
      throw new Error('Unexpected query in Viewer billing page test')
    })

    const page = await ProjectBillingPage({
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    const markup = renderToStaticMarkup(page)

    expect(markup).toContain('Invoices')
    expect(markup).not.toContain('Issue invoice')
  })
})
