import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  manilaCalendarDate,
  pickEffectiveTaxRates,
  roleHasCapability,
  type TaxProfileCandidate,
} from '@third-code-erp/shared-types'

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  select: vi.fn(),
  resolveTaxRates: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  profiles: [] as Row[],
  people: [] as Row[],
  conditions: [] as Array<{ table: string; condition: SQL }>,
}))

vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability: allowed } = await import('@third-code-erp/shared-types/authorization')
  return {
    requireUserProfile: mocks.requireUserProfile,
    requireCapability: (profile: { role: string }, capability: string) => {
      if (!allowed(profile.role as never, capability as never)) throw new Error('FORBIDDEN')
    },
  }
})
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
  resolveTaxRates: mocks.resolveTaxRates,
}))

import TaxSettingsPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PREPARER_ID = '33333333-3333-4333-8333-333333333333'
const APPROVER_ID = '44444444-4444-4444-8444-444444444444'

function profileRow(overrides: Row): Row {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    code: 'P-2026',
    name: 'Standard 2026',
    status: 'active',
    valid_from: '2026-01-01',
    valid_to: null,
    vat_rate_bps: 1200,
    withholding_rate_bps: 100,
    retention_rate_bps: 500,
    vat_registered: true,
    created_by: PREPARER_ID,
    approved_by: APPROVER_ID,
    approved_at: new Date('2025-12-20T02:00:00.000Z'),
    ...overrides,
  }
}

function installDb() {
  mocks.select.mockImplementation(() => ({
    from: (table: Parameters<typeof getTableName>[0]) => {
      const name = getTableName(table)
      const rows = name === 'tax_profiles' ? mocks.profiles : mocks.people
      const node: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
      }
      node.where = (condition: SQL) => {
        mocks.conditions.push({ table: name, condition })
        return node
      }
      node.orderBy = () => node
      node.limit = () => node
      return node
    },
  }))
  // The real picker over the same rows, as the database resolver would do.
  mocks.resolveTaxRates.mockImplementation(async (_db: unknown, _tenantId: string, at: Date) =>
    pickEffectiveTaxRates(mocks.profiles as unknown as TaxProfileCandidate[], manilaCalendarDate(at))
  )
}

async function render(role = 'finance') {
  mocks.requireUserProfile.mockResolvedValue({ role, tenantId: TENANT_ID })
  return renderToStaticMarkup(await TaxSettingsPage())
}

describe('read-only tax settings view (spec tenancy AC-TEN-01..04, AC-TEN-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    vi.stubEnv('ERP_TENANCY_ENABLED', 'true')
    vi.useFakeTimers({ toFake: ['Date'] })
    // Already 2026-11-05 in Manila.
    vi.setSystemTime(new Date('2026-11-04T16:30:00.000Z'))
    mocks.profiles = []
    mocks.people = [
      { id: PREPARER_ID, full_name: 'Paula Preparer' },
      { id: APPROVER_ID, full_name: 'Arturo Approver' },
    ]
    mocks.conditions = []
    installDb()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is not found while ERP_TENANCY_ENABLED is off, before any session or DB read', async () => {
    vi.stubEnv('ERP_TENANCY_ENABLED', '')

    await expect(TaxSettingsPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.requireUserProfile).not.toHaveBeenCalled()
    expect(mocks.resolveTaxRates).not.toHaveBeenCalled()
  })

  it.each(['pm', 'estimator', 'sd_pm_pe', 'procurement'])('denies %s before reading rates (AC-TEN-03)', async (role) => {
    expect(roleHasCapability(role as never, 'finance.read')).toBe(false)

    await expect(render(role)).rejects.toThrow('FORBIDDEN')
    expect(mocks.resolveTaxRates).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin', 'finance', 'viewer'])(
    'shows the defaults with no edit controls for %s (AC-TEN-01, AC-TEN-04)',
    async (role) => {
      const html = await render(role)

      expect(html).toContain('Effective rates as of 2026-11-05 (Manila)')
      expect(html).toContain('<th scope="col"')
      expect(html).toMatch(/VAT<\/td><td[^>]*>12%<\/td><td[^>]*>System default</)
      expect(html).toMatch(/>EWT<\/td><td[^>]*>2%</)
      expect(html).toMatch(/Retention<\/td><td[^>]*>10%</)
      expect(html).toMatch(/VAT-registered<\/td><td[^>]*>Yes</)
      expect(html).toContain('Rates are locked and cannot be edited here')
      expect(html).toContain('href="/settings"')
      expect(html).not.toMatch(/<(form|input|select|textarea|button)\b/)
      expect(mocks.resolveTaxRates).toHaveBeenCalledWith(expect.anything(), TENANT_ID, expect.any(Date))
    }
  )

  it('shows the profile in force, its people and upcoming profiles (AC-TEN-02)', async () => {
    mocks.profiles = [
      profileRow({}),
      profileRow({ id: '66666666-6666-4666-8666-666666666666', code: 'P-2027', valid_from: '2027-01-01' }),
    ]
    mocks.profiles[0]!.valid_to = '2026-12-31'

    const html = await render()

    expect(html).toMatch(/VAT<\/td><td[^>]*>12%<\/td><td[^>]*>Tax profile P-2026</)
    expect(html).toMatch(/>EWT<\/td><td[^>]*>1%</)
    expect(html).toMatch(/Retention<\/td><td[^>]*>5%</)
    expect(html).toContain('Standard 2026')
    expect(html).toContain('2026-12-31')
    expect(html).toContain('Paula Preparer')
    expect(html).toContain('Arturo Approver')
    expect(html).toContain('P-2027, starts 2027-01-01')
  })

  it('labels an open-ended profile and a non-VAT tenant', async () => {
    mocks.profiles = [profileRow({ vat_registered: false })]

    const html = await render()

    expect(html).toContain('Open-ended')
    expect(html).toMatch(/VAT-registered<\/td><td[^>]*>No</)
  })

  it('names the profile that ended when defaults apply again (spec §10)', async () => {
    mocks.profiles = [profileRow({ code: 'OLD-2026', valid_to: '2026-10-31' })]

    const html = await render()

    expect(html).toContain('System default (profile OLD-2026 ended on 2026-10-31)')
    expect(html).toMatch(/Retention<\/td><td[^>]*>10%</)
  })

  it('names the most recently ended profile when several have ended', async () => {
    mocks.profiles = [
      profileRow({ code: 'OLD-H2', valid_from: '2026-07-01', valid_to: '2026-10-31' }),
      profileRow({ id: '88888888-8888-4888-8888-888888888888', code: 'OLD-H1', valid_to: '2026-06-30' }),
    ]

    const html = await render()

    expect(html).toContain('System default (profile OLD-H2 ended on 2026-10-31)')
  })

  it('shows the conflict instead of rates when two active profiles overlap (AC-TEN-19)', async () => {
    mocks.profiles = [profileRow({ code: 'B' }), profileRow({ id: '77777777-7777-4777-8777-777777777777', code: 'A' })]

    const html = await render()

    expect(html).toContain('role="alert"')
    expect(html).toContain('A, B')
    expect(html).toContain('2026-11-05')
    expect(html).toContain('Invoices and purchase orders cannot be created')
    expect(html).not.toContain('%')
    expect(html).not.toMatch(/<(form|input|select|textarea|button)\b/)
  })

  it('filters every read by the tenant (AC-TEN-18)', async () => {
    mocks.profiles = [profileRow({})]

    await render()

    const dialect = new PgDialect()
    expect(mocks.conditions.map((entry) => entry.table)).toEqual(['tax_profiles', 'users'])
    for (const { condition } of mocks.conditions) {
      const query = dialect.sqlToQuery(condition)
      expect(query.sql).toMatch(/"(tax_profiles|users)"\."tenant_id" = \$1/)
      expect(query.params[0]).toBe(TENANT_ID)
    }
  })
})
