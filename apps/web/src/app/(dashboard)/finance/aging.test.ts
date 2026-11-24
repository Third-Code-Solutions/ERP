import { describe, expect, it } from 'vitest'
import { agingBucket, daysOverdue } from '@/lib/finance/dates'
import { agingBucketTotals, listCapNotice, MAX_LISTED_ROWS } from './aging'

describe('agingBucketTotals', () => {
  it('sums every row into exactly one of the six buckets', () => {
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
      (row) => agingBucket(daysOverdue(row.due, '2026-11-17')),
      (row) => row.cents
    )
    expect(totals).toEqual([
      { bucket: 'Current', amountCents: 100 },
      { bucket: '1–30 days', amountCents: 250 },
      { bucket: '31–60 days', amountCents: 400 },
      { bucket: '61–90 days', amountCents: 1_000 },
      { bucket: '90+ days', amountCents: 5_000 },
      { bucket: 'No due date', amountCents: 7 },
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
