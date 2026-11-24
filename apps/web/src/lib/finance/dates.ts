import { z } from 'zod'
import { calendarDaysBetween, manilaToday } from '@/lib/manila-date'

// The Manila calendar comes from the shared helper; finance adds only its report rules.
export { manilaToday }

/** Calendar day (YYYY-MM-DD) of an instant in Asia/Manila. */
export function manilaDay(instant: Date): string {
  return manilaToday(instant)
}

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

/** Whole days from one ISO day to another (positive when `toIso` is later). */
export function wholeDaysBetween(fromIso: string, toIso: string): number {
  return calendarDaysBetween(toIso, fromIso)
}

export const AGING_BUCKETS = ['Current', '1-30', '31-60', '61-90', '91+'] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

/** Days past due, never negative; a missing due date counts as not yet overdue. */
export function daysOverdue(dueDay: string | null, asOfDay: string): number {
  if (!dueDay) return 0
  return Math.max(wholeDaysBetween(dueDay, asOfDay), 0)
}

export function agingBucket(overdueDays: number): AgingBucket {
  if (overdueDays <= 0) return 'Current'
  if (overdueDays <= 30) return '1-30'
  if (overdueDays <= 60) return '31-60'
  if (overdueDays <= 90) return '61-90'
  return '91+'
}
