import { describe, expect, it } from 'vitest'
import {
  buildTrialBalance,
  resolveTrialBalanceRange,
  trialBalanceParamsSchema,
  trialBalanceStrictParamsSchema,
  type TrialBalanceAccount,
} from './trial-balance'

const CASH: TrialBalanceAccount = {
  id: 'cash',
  code: '1000',
  name: 'Cash in bank',
  accountType: 'asset',
  normalBalance: 'debit',
  isActive: true,
}
const REVENUE: TrialBalanceAccount = {
  id: 'revenue',
  code: '4000',
  name: 'Contract revenue',
  accountType: 'income',
  normalBalance: 'credit',
  isActive: true,
}
const UNUSED: TrialBalanceAccount = {
  id: 'unused',
  code: '9000',
  name: 'Unused',
  accountType: 'expense',
  normalBalance: 'debit',
  isActive: false,
}

describe('buildTrialBalance', () => {
  it('reports each balance on the account normal side and totals both columns', () => {
    const result = buildTrialBalance(
      [CASH, REVENUE, UNUSED],
      [
        { accountId: 'cash', debitCents: 150_000, creditCents: 50_000 },
        { accountId: 'revenue', debitCents: 0, creditCents: 100_000 },
      ]
    )

    expect(result.rows.map((row) => [row.code, row.balanceCents])).toEqual([
      ['1000', 100_000],
      ['4000', 100_000],
      ['9000', 0],
    ])
    expect(result.totalDebitCents).toBe(150_000)
    expect(result.totalCreditCents).toBe(150_000)
    expect(result.differenceCents).toBe(0)
    expect(result.isBalanced).toBe(true)
  })

  it('keeps an account with no postings as a zero row', () => {
    const result = buildTrialBalance([UNUSED], [])

    expect(result.rows).toEqual([
      { ...UNUSED, debitCents: 0, creditCents: 0, balanceCents: 0 },
    ])
    expect(result.isBalanced).toBe(true)
  })

  it('nets an original entry and its reversal to zero on every account', () => {
    // 100.00 sale, then the reversal entry with the sides swapped.
    const result = buildTrialBalance(
      [CASH, REVENUE],
      [
        { accountId: 'cash', debitCents: 10_000, creditCents: 10_000 },
        { accountId: 'revenue', debitCents: 10_000, creditCents: 10_000 },
      ]
    )

    expect(result.rows.map((row) => row.balanceCents)).toEqual([0, 0])
    expect(result.isBalanced).toBe(true)
  })

  it('shows a negative balance when an account sits on its opposite side', () => {
    const result = buildTrialBalance(
      [CASH],
      [{ accountId: 'cash', debitCents: 1_000, creditCents: 4_000 }]
    )

    expect(result.rows[0]?.balanceCents).toBe(-3_000)
  })

  it('flags a defect when total debits differ from total credits', () => {
    const result = buildTrialBalance(
      [CASH, REVENUE],
      [
        { accountId: 'cash', debitCents: 10_001, creditCents: 0 },
        { accountId: 'revenue', debitCents: 0, creditCents: 10_000 },
      ]
    )

    expect(result.differenceCents).toBe(1)
    expect(result.isBalanced).toBe(false)
  })
})

describe('resolveTrialBalanceRange', () => {
  it('is cumulative to the as-of date when no period is chosen', () => {
    expect(resolveTrialBalanceRange('2026-11-17', null)).toEqual({
      from: null,
      to: '2026-11-17',
    })
  })

  it('starts at the period start and stops at the as-of date inside the period', () => {
    const period = { startsOn: '2026-11-01', endsOn: '2026-11-30' }
    expect(resolveTrialBalanceRange('2026-11-17', period)).toEqual({
      from: '2026-11-01',
      to: '2026-11-17',
    })
  })

  it('never reaches past the period end', () => {
    const period = { startsOn: '2026-10-01', endsOn: '2026-10-31' }
    expect(resolveTrialBalanceRange('2026-11-17', period)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
  })
})

describe('trial balance params', () => {
  const PERIOD_ID = '11111111-1111-4111-8111-111111111111'

  it('accepts an as-of date and a period id, both optional', () => {
    expect(trialBalanceStrictParamsSchema.safeParse({}).success).toBe(true)
    expect(
      trialBalanceStrictParamsSchema.safeParse({
        asOf: '2026-11-17',
        period: PERIOD_ID,
      }).success
    ).toBe(true)
  })

  it.each([
    { asOf: '2026-02-30' },
    { asOf: '17-11-2026' },
    { period: 'not-a-uuid' },
    { asOf: ['2026-11-17', '2026-11-18'] },
    { tenant_id: PERIOD_ID },
  ])('rejects %j on the strict export form', (params) => {
    expect(trialBalanceStrictParamsSchema.safeParse(params).success).toBe(false)
  })

  it('lets the page ignore unknown keys but still validates known ones', () => {
    expect(trialBalanceParamsSchema.safeParse({ extra: 'x' }).success).toBe(true)
    expect(trialBalanceParamsSchema.safeParse({ asOf: 'bad' }).success).toBe(false)
  })
})
