import { AGING_BUCKETS, type AgingBucket } from '@/lib/finance/dates'

/** Rows shown in a receivables or payables list; totals always cover every row. */
export const MAX_LISTED_ROWS = 500

export function agingBucketTotals<T>(
  rows: readonly T[],
  bucketOf: (row: T) => AgingBucket,
  amountCentsOf: (row: T) => number
): Array<{ bucket: AgingBucket; amountCents: number }> {
  return AGING_BUCKETS.map((bucket) => ({
    bucket,
    amountCents: rows
      .filter((row) => bucketOf(row) === bucket)
      .reduce((total, row) => total + amountCentsOf(row), 0),
  }))
}

/** Visible-rows notice, or null when every row is shown. */
export function listCapNotice(total: number): string | null {
  if (total <= MAX_LISTED_ROWS) return null
  return `Showing the first ${MAX_LISTED_ROWS} of ${total} rows. Balances and aging above include all ${total}.`
}
