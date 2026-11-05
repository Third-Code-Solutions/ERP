import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { TaxProfileOverlapError, type TaxProfileCandidate } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../client'
import { effectiveTaxProfilesCondition, resolveTaxRates } from './effective-tax-rates'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

function render(condition: SQL | undefined) {
  if (!condition) throw new Error('Missing tax profile condition')
  return new PgDialect().sqlToQuery(condition)
}

function executorReturning(rows: TaxProfileCandidate[]) {
  const where = vi.fn<(condition: SQL | undefined) => Promise<TaxProfileCandidate[]>>(
    async () => rows,
  )
  const executor = {
    select: vi.fn(() => ({ from: () => ({ where }) })),
  } as unknown as Pick<Database, 'select'>
  return { executor, where }
}

function activeProfile(code: string): TaxProfileCandidate {
  return {
    id: `profile-${code}`,
    code,
    status: 'active',
    valid_from: '2026-01-01',
    valid_to: null,
    vat_rate_bps: 1200,
    withholding_rate_bps: 100,
    retention_rate_bps: 500,
    vat_registered: true,
  }
}

describe('effective tax rates loader (spec tenancy C-1)', () => {
  it('AC-TEN-18: tenant predicate first, active and in-date on the Manila date', () => {
    const query = render(effectiveTaxProfilesCondition(TENANT_ID, '2026-11-04'))
    expect(query.sql).toBe(
      '("tax_profiles"."tenant_id" = $1 and "tax_profiles"."status" = $2 and "tax_profiles"."valid_from" <= $3 and ("tax_profiles"."valid_to" is null or "tax_profiles"."valid_to" >= $4))',
    )
    expect(query.params).toEqual([TENANT_ID, 'active', '2026-11-04', '2026-11-04'])
  })

  it('R-8: derives the Manila date from the write instant', async () => {
    const { executor, where } = executorReturning([])
    const rates = await resolveTaxRates(executor, TENANT_ID, new Date('2026-12-31T16:30:00Z'))
    expect(rates.asOf).toBe('2027-01-01')
    expect(render(where.mock.calls[0]?.[0]).params).toEqual([
      TENANT_ID,
      'active',
      '2027-01-01',
      '2027-01-01',
    ])
  })

  it('R-1: no rows → defaults', async () => {
    const { executor } = executorReturning([])
    await expect(
      resolveTaxRates(executor, TENANT_ID, new Date('2026-11-04T02:00:00Z')),
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
  })

  it('one row → that profile', async () => {
    const { executor } = executorReturning([activeProfile('A')])
    await expect(
      resolveTaxRates(executor, TENANT_ID, new Date('2026-11-04T02:00:00Z')),
    ).resolves.toMatchObject({ source: 'profile', profileCode: 'A', retentionBps: 500 })
  })

  it('R-7: two rows → TAX_PROFILE_OVERLAP naming both codes', async () => {
    const { executor } = executorReturning([activeProfile('C'), activeProfile('A')])
    await expect(
      resolveTaxRates(executor, TENANT_ID, new Date('2026-11-04T02:00:00Z')),
    ).rejects.toBeInstanceOf(TaxProfileOverlapError)
    await expect(
      resolveTaxRates(executor, TENANT_ID, new Date('2026-11-04T02:00:00Z')),
    ).rejects.toMatchObject({ profileCodes: ['A', 'C'] })
  })
})
