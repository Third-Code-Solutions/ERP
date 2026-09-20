import type { SQL } from 'drizzle-orm'
import React from 'react'
import { PgDialect } from 'drizzle-orm/pg-core'
import { boms, invoices, projects } from '@third-code-erp/database/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  milestonesEnabled: vi.fn(),
  readMilestones: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
  can: (await import('@third-code-erp/shared-types/authorization')).roleHasCapability,
}))

vi.mock('@/lib/erp-core-client', () => ({
  projectBillingMilestoneReadsUseCoreApi: mocks.milestonesEnabled,
  getProjectBillingMilestonesThroughCoreApi: mocks.readMilestones,
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
    mocks.milestonesEnabled.mockReturnValue(false)
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

    expect(markup).toContain('<h1 class="page-title">Billing</h1>')
    expect(markup).toContain('Invoices')
    expect(markup).not.toContain('Issue invoice')
  })
})

describe('ProjectBillingPage milestone navigation', () => {
  const result = {
    projectId: PROJECT_ID, coc: null, total: 26, page: 2, limit: 25, totalPages: 2,
    rows: [{
      claimId: '44444444-4444-4444-8444-444444444444', claimNumber: 'PC-00026',
      milestonePct: 90, amountCents: 100_000, claimStatus: 'submitted',
      certificateDocumentId: null, invoiceId: null, invoiceNumber: null,
      invoiceStatus: null, cocStatus: null,
      evidence: { lockedWarPeriods: 0, latestWarWeekEnding: null, latestWarOverallPct: null },
      readyForInvoice: false, blockers: ['claim_not_certified'],
    }],
  }
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'finance' })
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: unknown) => {
      if (table === projects) return { where: async () => [{ id: PROJECT_ID, name: 'Visible project' }] }
      if (table === invoices) return { where: () => ({ orderBy: async () => [] }) }
      if (table === boms) return { where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }
      throw new Error('Unexpected billing query')
    })
    mocks.milestonesEnabled.mockReturnValue(true)
    mocks.readMilestones.mockResolvedValue({ ok: true, data: result })
  })

  it('loads the requested page and preserves other query state in real rendered links', async () => {
    const page = await ProjectBillingPage({ params: Promise.resolve({ id: PROJECT_ID }), searchParams: Promise.resolve({ milestonePage: '2', filter: ['open', 'overdue'] }) })
    const html = renderToStaticMarkup(page)
    expect(mocks.readMilestones).toHaveBeenCalledWith(PROJECT_ID, { page: 2, limit: 25 })
    expect(html).toContain('PC-00026')
    expect(html).toContain(`/projects/${PROJECT_ID}/billing?filter=open&amp;filter=overdue#project-billing-milestones-heading`)
    expect(html).toContain('Invoices')
  })

  it.each(['0', '-1', '1.5', '1e2', '100001', ['1', '2']].map(value => ({ value })))('keeps malformed page %j explicit without querying Core', async ({ value }) => {
    const page = await ProjectBillingPage({ params: Promise.resolve({ id: PROJECT_ID }), searchParams: Promise.resolve({ milestonePage: value }) })
    const html = renderToStaticMarkup(page)
    expect(mocks.readMilestones).not.toHaveBeenCalled()
    expect(html).toContain('Invalid milestone page')
    expect(html).toContain('Invoices')
    expect(html).toContain('First milestone page')
  })

  it('keeps Core failure distinct from an empty project and offers a retry', async () => {
    mocks.readMilestones.mockResolvedValue({ ok: false, status: 503, error: 'Controlled outage' })
    const page = await ProjectBillingPage({ params: Promise.resolve({ id: PROJECT_ID }), searchParams: Promise.resolve({ milestonePage: '2' }) })
    const html = renderToStaticMarkup(page)
    expect(html).toContain('Core could not verify')
    expect(html).toContain('Retry milestone evidence')
    expect(html).toContain('milestonePage=2')
    expect(html).not.toContain('No progress claims')
    expect(html).toContain('Invoices')
  })

  it.each(['estimator', 'pm', 'sales', 'commercial', 'design', 'sd_pm_pe', 'procurement', 'safety', 'cx'])('denies %s before querying billing data', async role => {
    mocks.requireUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role })
    await expect(ProjectBillingPage({ params: Promise.resolve({ id: PROJECT_ID }) })).rejects.toThrow()
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.readMilestones).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin', 'finance', 'viewer'])('preserves the billing read for %s', async role => {
    mocks.requireUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role })
    mocks.readMilestones.mockResolvedValue({ ok: true, data: { ...result, page: 1 } })
    const page = await ProjectBillingPage({ params: Promise.resolve({ id: PROJECT_ID }) })
    expect(renderToStaticMarkup(page)).toContain('Milestone billing traceability')
    expect(mocks.readMilestones).toHaveBeenCalledWith(PROJECT_ID, { page: 1, limit: 25 })
  })
})
