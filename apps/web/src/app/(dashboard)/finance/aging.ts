import { calendarDaysBetween } from '@/lib/manila-date'

export const AGING_BUCKETS = ['Current', '1–30', '31–60', '61–90', '91+'] as const

export type AgingBucket = (typeof AGING_BUCKETS)[number]

/** Rows shown in a receivables or payables list; totals always cover every row. */
export const MAX_LISTED_ROWS = 500

/** Days past due on `today`; both are YYYY-MM-DD, no due date counts as not late. */
export function daysPastDue(dueDate: string | null, today: string): number {
  if (!dueDate) return 0
  return calendarDaysBetween(today, dueDate)
}

export function agingBucket(daysLate: number): AgingBucket {
  if (daysLate <= 0) return 'Current'
  if (daysLate <= 30) return '1–30'
  if (daysLate <= 60) return '31–60'
  if (daysLate <= 90) return '61–90'
  return '91+'
}

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
