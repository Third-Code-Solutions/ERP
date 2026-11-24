import { describe, expect, it } from 'vitest'
import {
  agingBucket,
  agingBucketTotals,
  daysPastDue,
  listCapNotice,
  MAX_LISTED_ROWS,
} from './aging'

describe('agingBucket', () => {
  it.each([
    [-5, 'Current'],
    [0, 'Current'],
    [1, '1–30'],
    [30, '1–30'],
    [31, '31–60'],
    [60, '31–60'],
    [61, '61–90'],
    [90, '61–90'],
    [91, '91+'],
    [400, '91+'],
  ])('puts %i days late in %s', (days, bucket) => {
    expect(agingBucket(days)).toBe(bucket)
  })
})

describe('daysPastDue', () => {
  it('counts calendar days late', () => {
    expect(daysPastDue('2026-10-01', '2026-11-17')).toBe(47)
  })

  it('is negative before the due date', () => {
    expect(daysPastDue('2026-11-20', '2026-11-17')).toBe(-3)
  })

  it('treats a missing due date as not late', () => {
    expect(daysPastDue(null, '2026-11-17')).toBe(0)
  })
})

describe('agingBucketTotals', () => {
  it('sums every row into exactly one of the five buckets', () => {
    const rows = [
      { due: '2026-11-20', cents: 100 },
      { due: '2026-11-10', cents: 250 },
      { due: '2026-10-01', cents: 400 },
      { due: '2026-09-10', cents: 1_000 },
      { due: '2026-01-01', cents: 5_000 },
      { due: null, cents: 7 },
    ]
    const totals = agingBucketTotals(
      rows,
      (row) => agingBucket(daysPastDue(row.due, '2026-11-17')),
      (row) => row.cents
    )
    expect(totals).toEqual([
      { bucket: 'Current', amountCents: 107 },
      { bucket: '1–30', amountCents: 250 },
      { bucket: '31–60', amountCents: 400 },
      { bucket: '61–90', amountCents: 1_000 },
      { bucket: '91+', amountCents: 5_000 },
    ])
    expect(totals.reduce((sum, row) => sum + row.amountCents, 0)).toBe(
      rows.reduce((sum, row) => sum + row.cents, 0)
    )
  })
})

describe('listCapNotice', () => {
  it('is silent at the cap and states the totals scope above it', () => {
    expect(listCapNotice(MAX_LISTED_ROWS)).toBeNull()
    expect(listCapNotice(MAX_LISTED_ROWS + 1)).toBe(
      'Showing the first 500 of 501 rows. Balances and aging above include all 501.'
    )
  })
})
