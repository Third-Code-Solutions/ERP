// Spec-derived tests for the tenant-scoped rate loader (spec C-1, AC-TEN-17,
// AC-TEN-18, R-8; plan §7.3). Expected values come from the spec.
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../client'
import { effectiveTaxProfilesCondition, resolveTaxRates } from './effective-tax-rates'

const TENANT_T = '22222222-2222-4222-8222-222222222222'
const TENANT_U = '44444444-4444-4444-8444-444444444444'

type Row = {
  id: string
  code: string
  status: string
  valid_from: string
  valid_to: string | null
  vat_rate_bps: number
  withholding_rate_bps: number
  retention_rate_bps: number
  vat_registered: boolean
}

function executorReturning(rows: Row[]) {
  const where = vi.fn<(condition: SQL | undefined) => Promise<Row[]>>(async () => rows)
  const from = vi.fn(() => ({ where }))
  const executor = { select: vi.fn(() => ({ from })) } as unknown as Pick<Database, 'select'>
  return { executor, where, from }
}

function render(condition: SQL | undefined) {
  if (!condition) throw new Error('Missing tax profile condition')
  return new PgDialect().sqlToQuery(condition)
}

describe('effectiveTaxProfilesCondition (AC-TEN-18 tenant predicate)', () => {
  it('starts with the explicit tenant predicate and filters active, in-date rows', () => {
    const query = render(effectiveTaxProfilesCondition(TENANT_T, '2026-11-04'))
    expect(query.sql.startsWith('("tax_profiles"."tenant_id" = $1 and ')).toBe(true)
    expect(query.params[0]).toBe(TENANT_T)
    expect(query.sql).toMatch(/"tax_profiles"\."status" = \$\d/)
    expect(query.sql).toMatch(/"tax_profiles"\."valid_from" <= \$\d/)
    expect(query.sql).toMatch(
      /\("tax_profiles"\."valid_to" is null or "tax_profiles"\."valid_to" >= \$\d\)/
    )
    expect(query.params).toContain('active')
    expect(query.params.filter((param) => param === '2026-11-04')).toHaveLength(2)
    // The only uuid bound is the caller's tenant.
    expect(query.params).not.toContain(TENANT_U)
  })
})

describe('resolveTaxRates (C-1 loader)', () => {
  it('R-1 no rows → TAX_DEFAULTS with source default and the Manila as-of date', async () => {
    const { executor, where } = executorReturning([])
    await expect(
      resolveTaxRates(executor, TENANT_T, new Date('2026-11-04T04:00:00Z'))
    ).resolves.toEqual({
      vatBps: 1200,
      ewtBps: 200,
      retentionBps: 1000,
      vatRegistered: true,
      source: 'default',
      profileId: null,
      profileCode: null,
      asOf: '2026-11-04',
    })
    expect(render(where.mock.calls[0]?.[0]).params[0]).toBe(TENANT_T)
  })

  it('R-8 derives the Manila date itself: 2026-12-31T16:30Z queries and reports 2027-01-01', async () => {
    const { executor, where } = executorReturning([])
    const result = await resolveTaxRates(executor, TENANT_T, new Date('2026-12-31T16:30:00Z'))
    expect(result.asOf).toBe('2027-01-01')
    const params = render(where.mock.calls[0]?.[0]).params
    expect(params).toContain('2027-01-01')
    expect(params).not.toContain('2026-12-31')
  })

  it('2026-11-04T16:30Z is already 2026-11-05 in Manila', async () => {
    const { executor } = executorReturning([])
    await expect(
      resolveTaxRates(executor, TENANT_T, new Date('2026-11-04T16:30:00Z'))
    ).resolves.toMatchObject({ asOf: '2026-11-05' })
  })

  it('one in-force active row → that profile (source, id, code, rates)', async () => {
    const row: Row = {
      id: '55555555-5555-4555-8555-555555555555',
      code: 'PH-2026',
      status: 'active',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
      vat_rate_bps: 1200,
      withholding_rate_bps: 100,
      retention_rate_bps: 500,
      vat_registered: true,
    }
    const { executor } = executorReturning([row])
    await expect(
      resolveTaxRates(executor, TENANT_T, new Date('2026-11-04T04:00:00Z'))
    ).resolves.toEqual({
      vatBps: 1200,
      ewtBps: 100,
      retentionBps: 500,
      vatRegistered: true,
      source: 'profile',
      profileId: row.id,
      profileCode: 'PH-2026',
      asOf: '2026-11-04',
    })
  })

  it('R-7 two in-force active rows → rejects with TAX_PROFILE_OVERLAP naming both codes', async () => {
    const base = {
      status: 'active',
      valid_from: '2026-01-01',
      valid_to: null,
      vat_rate_bps: 1200,
      withholding_rate_bps: 200,
      retention_rate_bps: 1000,
      vat_registered: true,
    }
    const { executor } = executorReturning([
      { ...base, id: '66666666-6666-4666-8666-666666666666', code: 'C' },
      { ...base, id: '77777777-7777-4777-8777-777777777777', code: 'A' },
    ])
    const outcome = resolveTaxRates(executor, TENANT_T, new Date('2026-11-04T04:00:00Z'))
    await expect(outcome).rejects.toMatchObject({ profileCodes: ['A', 'C'], asOf: '2026-11-04' })
    await outcome.catch((error: Error & { code?: string }) => {
      expect(`${error.code ?? ''} ${error.message}`).toContain('TAX_PROFILE_OVERLAP')
    })
  })
})
