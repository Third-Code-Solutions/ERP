// Spec-derived tests for the read-only tax settings view (spec AC-TEN-01..04,
// AC-TEN-19 view part, §10 ended/upcoming, §13 accessibility; plan §10).
// Only auth, routing and the DB driver are mocked: the real loader and the real
// rate resolver run over rows served by a chainable `db.select` fake.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Column, SQL, getTableName, is } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { roleHasCapability } from '@third-code-erp/shared-types'

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  select: vi.fn(),
  rows: {} as Record<string, Row[]>,
  conditions: [] as Array<{ table: string; condition: unknown }>,
}))

vi.mock('@third-code-erp/auth', async () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
  can: (await import('@third-code-erp/shared-types/authorization')).roleHasCapability,
}))
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@third-code-erp/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@third-code-erp/database')>()),
  db: { select: mocks.select },
}))

import TaxSettingsPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PREPARER_ID = '33333333-3333-4333-8333-333333333333'
const APPROVER_ID = '44444444-4444-4444-8444-444444444444'
// 2026-11-04T16:30Z is already 2026-11-05 in Manila (spec C-1).
const NOW = new Date('2026-11-04T16:30:00.000Z')
const AS_OF = '2026-11-05'

const READERS = ['owner', 'admin', 'finance', 'viewer'] as const
const DENIED = ['sales', 'commercial', 'design', 'sd_pm_pe', 'procurement', 'safety', 'cx', 'estimator', 'pm'] as const

function project(row: Row, fields: unknown): Row {
  if (!fields) return { ...row }
  return Object.fromEntries(
    Object.entries(fields as Record<string, unknown>).map(([key, field]) => {
      if (is(field, Column)) return [key, row[field.name]]
      if (field && typeof field === 'object' && !is(field, SQL) && Object.getPrototypeOf(field) === Object.prototype) {
        return [key, project(row, field)]
      }
      return [key, undefined]
    })
  )
}

function installDb() {
  mocks.select.mockImplementation((fields?: unknown) => ({
    from: (table: Parameters<typeof getTableName>[0]) => {
      const name = getTableName(table)
      const query: Record<string, unknown> = {}
      const self = () => query
      Object.assign(query, {
        where: (condition: unknown) => {
          mocks.conditions.push({ table: name, condition })
          return query
        },
        orderBy: self,
        limit: self,
        offset: self,
        innerJoin: self,
        leftJoin: self,
        then: (resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve((mocks.rows[name] ?? []).map((row) => project(row, fields))).then(resolve, reject),
      })
      return query
    },
  }))
}

function profileRow(overrides: Row): Row {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    tenant_id: TENANT_ID,
    code: 'PH-2026',
    name: 'PH standard 2026',
    status: 'active',
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    vat_rate_bps: 1200,
    withholding_rate_bps: 100,
    retention_rate_bps: 500,
    vat_registered: true,
    bir_form_version: null,
    statutory_configuration: {},
    created_by: PREPARER_ID,
    approved_by: APPROVER_ID,
    approved_at: new Date('2025-12-20T02:00:00.000Z'),
    created_at: new Date('2025-12-19T02:00:00.000Z'),
    updated_at: new Date('2025-12-20T02:00:00.000Z'),
    ...overrides,
  }
}

const USERS: Row[] = [
  { id: PREPARER_ID, tenant_id: TENANT_ID, full_name: 'Ysa Preparer', email: 'ysa@example.test', role: 'finance' },
  { id: APPROVER_ID, tenant_id: TENANT_ID, full_name: 'Xander Approver', email: 'xander@example.test', role: 'admin' },
]

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// Rates-table body rows: labelled VAT / EWT / retention / VAT-registered and
// carrying a value (a percentage or Yes/No).
function rateRows(html: string): string[] {
  return [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)]
    .map((match) => match[0])
    .filter((row) => /<td/i.test(row))
    .map(visibleText)
    .filter((row) => /^(VAT|EWT|withholding|retention)/i.test(row))
    .filter((row) => /\d+(\.\d+)?%|\b(Yes|No)\b/.test(row))
}

function rowMatching(rows: string[], label: RegExp): string {
  const row = rows.find((candidate) => label.test(candidate))
  expect(row, `rate row ${label}`).toBeDefined()
  return row ?? ''
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function dateLike(iso: string): RegExp {
  const [year, month, day] = iso.split('-').map(Number)
  const long = MONTHS[month! - 1]!
  const short = long.slice(0, 3)
  return new RegExp(
    [
      iso,
      `(${long}|${short}) ${day}, ${year}`,
      `${day} (${long}|${short}) ${year}`,
      `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
      `${month}/${day}/${year}`,
    ].join('|')
  )
}

async function renderAs(role: string): Promise<string> {
  mocks.requireUserProfile.mockResolvedValue({
    role,
    tenantId: TENANT_ID,
    user: { id: 'viewer-user', email: 'user@example.test' },
    email: 'user@example.test',
    fullName: 'Test user',
  })
  return renderToStaticMarkup(await TaxSettingsPage())
}

function tenantPredicateHolds(table: string, condition: unknown) {
  const query = new PgDialect().sqlToQuery(condition as SQL)
  const match = new RegExp(`"${table}"\\."tenant_id" = \\$(\\d+)`).exec(query.sql)
  expect(match, `${table} query lacks an explicit tenant predicate: ${query.sql}`).not.toBeNull()
  expect(query.params[Number(match?.[1]) - 1]).toBe(TENANT_ID)
}

describe('/settings/tax read-only view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.stubGlobal('React', React)
    vi.stubEnv('ERP_TENANCY_ENABLED', 'true')
    mocks.rows = { tax_profiles: [], users: USERS }
    mocks.conditions = []
    mocks.requireCapability.mockImplementation(
      (profile: { role: string }, capability: Parameters<typeof roleHasCapability>[1]) => {
        if (!roleHasCapability(profile.role as Parameters<typeof roleHasCapability>[0], capability)) {
          throw Object.assign(
            new Error(`Forbidden: role "${profile.role}" lacks capability "${capability}"`),
            { code: 'FORBIDDEN' }
          )
        }
      }
    )
    installDb()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('AC-TEN-01 defaults (R-1)', () => {
    it.each(READERS)('%s sees 12% / 2% / 10% / Yes, each marked system default, as of the Manila date', async (role) => {
      const markup = await renderAs(role)
      const rows = rateRows(markup)
      expect(rows.length).toBeGreaterThanOrEqual(4)
      for (const row of rows) expect(row).toMatch(/system default/i)
      expect(rowMatching(rows, /^VAT\b(?![- ]?registered)/i)).toContain('12%')
      expect(rowMatching(rows, /EWT|withholding/i)).toMatch(/(^|[^\d.])2%/)
      expect(rowMatching(rows, /retention/i)).toContain('10%')
      expect(rowMatching(rows, /registered/i)).toMatch(/\bYes\b/)
      expect(visibleText(markup)).toMatch(dateLike(AS_OF))
      expect(markup).toMatch(/<th\b/)
      expect(mocks.requireCapability).toHaveBeenCalledWith(expect.objectContaining({ role }), 'finance.read')
    })
  })

  describe('AC-TEN-04 no edit controls, locked note', () => {
    it.each(READERS)('%s gets no form, input, select, textarea, button or create/edit action', async (role) => {
      mocks.rows.tax_profiles = [
        profileRow({}),
        profileRow({ id: '66666666-6666-4666-8666-666666666666', code: 'PH-2027', valid_from: '2027-01-01', valid_to: null }),
      ]
      const markup = await renderAs(role)
      expect(markup).not.toMatch(/<(form|input|select|textarea|button)\b/i)
      expect(markup).not.toMatch(/href="[^"]*(\/new|edit|activate|retire)[^"]*"/i)
      expect(visibleText(markup)).toMatch(/locked/i)
    })
  })

  describe('AC-TEN-02 profile in force, with an upcoming one (R-2, R-5)', () => {
    it('shows the profile rates, code, name, dates, preparer, approver and approval time; source is the profile', async () => {
      mocks.rows.tax_profiles = [
        profileRow({}),
        profileRow({
          id: '66666666-6666-4666-8666-666666666666',
          code: 'PH-2027',
          name: 'PH standard 2027',
          valid_from: '2027-01-01',
          valid_to: null,
          withholding_rate_bps: 200,
          retention_rate_bps: 1000,
        }),
      ]
      const markup = await renderAs('finance')
      const text = visibleText(markup)
      const rows = rateRows(markup)
      for (const row of rows) {
        expect(row).toContain('PH-2026')
        expect(row).not.toMatch(/system default/i)
      }
      expect(rowMatching(rows, /^VAT\b(?![- ]?registered)/i)).toContain('12%')
      expect(rowMatching(rows, /EWT|withholding/i)).toMatch(/(^|[^\d.])1%/)
      expect(rowMatching(rows, /retention/i)).toMatch(/(^|[^\d.])5%/)
      expect(text).toContain('PH standard 2026')
      expect(text).toMatch(dateLike('2026-01-01'))
      expect(text).toMatch(dateLike('2026-12-31'))
      expect(text).toContain('Ysa Preparer')
      expect(text).toContain('Xander Approver')
      expect(text).toMatch(dateLike('2025-12-20'))
      // Upcoming profile with its start date.
      expect(text).toMatch(/upcoming/i)
      expect(text).toContain('PH-2027')
      expect(text).toMatch(dateLike('2027-01-01'))
    })

    it('AC-TEN-18 every query carries an explicit tenant_id predicate for the session tenant', async () => {
      mocks.rows.tax_profiles = [profileRow({})]
      await renderAs('finance')
      const profileQueries = mocks.conditions.filter((entry) => entry.table === 'tax_profiles')
      expect(profileQueries.length).toBeGreaterThanOrEqual(1)
      for (const entry of mocks.conditions) {
        if (entry.table === 'tax_profiles' || entry.table === 'users') tenantPredicateHolds(entry.table, entry.condition)
      }
    })
  })

  describe('spec §10 ended and future profiles', () => {
    it('R-3 an expired profile: defaults apply and the source names the ended profile and its end date', async () => {
      mocks.rows.tax_profiles = [profileRow({ code: 'PH-OLD', valid_to: '2026-10-31' })]
      const markup = await renderAs('finance')
      const rows = rateRows(markup)
      expect(rows.length).toBeGreaterThanOrEqual(4)
      for (const row of rows) expect(row).toMatch(/system default/i)
      expect(rowMatching(rows, /retention/i)).toContain('10%')
      const text = visibleText(markup)
      expect(text).toContain('PH-OLD')
      expect(text).toMatch(/ended/i)
      expect(text).toMatch(dateLike('2026-10-31'))
    })

    it('R-5 a future-dated profile only: defaults apply and it is listed as upcoming', async () => {
      mocks.rows.tax_profiles = [profileRow({ code: 'PH-2027', valid_from: '2027-01-01', valid_to: null })]
      const markup = await renderAs('viewer')
      for (const row of rateRows(markup)) expect(row).toMatch(/system default/i)
      const text = visibleText(markup)
      expect(text).toMatch(/upcoming/i)
      expect(text).toContain('PH-2027')
      expect(text).toMatch(dateLike('2027-01-01'))
    })
  })

  describe('AC-TEN-19 overlap shows the conflict instead of rates', () => {
    it('names both codes and the date in an alert and shows no rates', async () => {
      mocks.rows.tax_profiles = [
        profileRow({ code: 'PH-C', valid_from: '2026-06-01', valid_to: null, vat_rate_bps: 1250 }),
        profileRow({ id: '77777777-7777-4777-8777-777777777777', code: 'PH-A', vat_rate_bps: 1250 }),
      ]
      const markup = await renderAs('finance')
      expect(markup).toContain('role="alert"')
      const text = visibleText(markup)
      expect(text).toContain('PH-A')
      expect(text).toContain('PH-C')
      expect(text).toMatch(dateLike(AS_OF))
      expect(text).not.toContain('12.5%')
      expect(text).not.toContain('12%')
      expect(rateRows(markup)).toHaveLength(0)
    })
  })

  describe('AC-TEN-03 access control', () => {
    it.each(DENIED)('%s without finance.read is denied before any rate is read', async (role) => {
      mocks.requireUserProfile.mockResolvedValue({ role, tenantId: TENANT_ID, user: { id: 'u' } })
      await expect(TaxSettingsPage()).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(mocks.requireCapability).toHaveBeenCalledWith(expect.objectContaining({ role }), 'finance.read')
      expect(mocks.select).not.toHaveBeenCalled()
    })

    it('an unauthenticated request is rejected before any rate is read', async () => {
      mocks.requireUserProfile.mockRejectedValue(
        Object.assign(new Error('Unauthorized'), { code: 'UNAUTHENTICATED' })
      )
      await expect(TaxSettingsPage()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
      expect(mocks.select).not.toHaveBeenCalled()
    })

    it.each(['', 'false', '1'])('feature flag erp_tenancy off (ERP_TENANCY_ENABLED=%j) → not found, nothing read', async (value) => {
      vi.stubEnv('ERP_TENANCY_ENABLED', value)
      mocks.requireUserProfile.mockResolvedValue({ role: 'owner', tenantId: TENANT_ID, user: { id: 'u' } })
      await expect(TaxSettingsPage()).rejects.toThrow()
      expect(mocks.notFound).toHaveBeenCalled()
      expect(mocks.select).not.toHaveBeenCalled()
    })
  })
})
