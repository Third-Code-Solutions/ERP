import { z } from 'zod'
import { calendarDaysBetween, manilaToday } from '@/lib/manila-date'

// The Manila calendar comes from the shared helper; finance adds only its report rules.
export { manilaToday }

/** Calendar day of a timestamp that stores a date as UTC midnight (how invoice due dates are written). */
export function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10)
}

function isRealCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && utcDay(parsed) === value
}

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealCalendarDate)

/**
 * The one aging rule for the finance screens and the CSV exports, so their
 * totals tie: today is the Manila calendar day, and the labels are the
 * receivables screen's.
 */
export const AGING_BUCKETS = [
  'Current',
  '1–30 days',
  '31–60 days',
  '61–90 days',
  '90+ days',
  'No due date',
] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

/** Days past due as of `asOfDay` (a Manila day), never negative; null when there is no due date. */
export function daysOverdue(dueDay: string | null, asOfDay: string): number | null {
  if (!dueDay) return null
  return Math.max(calendarDaysBetween(asOfDay, dueDay), 0)
}

export function agingBucket(overdueDays: number | null): AgingBucket {
  if (overdueDays === null) return 'No due date'
  if (overdueDays <= 0) return 'Current'
  if (overdueDays <= 30) return '1–30 days'
  if (overdueDays <= 60) return '31–60 days'
  if (overdueDays <= 90) return '61–90 days'
  return '90+ days'
}
