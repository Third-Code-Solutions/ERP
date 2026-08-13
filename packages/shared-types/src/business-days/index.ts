import philippineHolidayData from './philippine-holidays.json'
import { z } from 'zod'

export type HolidayKind = 'regular' | 'special_non_working' | 'local'

export interface HolidayEntry {
  date: string
  name: string
  kind: HolidayKind
  source: string
  is_enabled?: boolean
}

export interface BusinessDayCalendar {
  holidays: readonly HolidayEntry[]
  weekendDays?: readonly number[]
}

export interface BusinessDayService {
  readonly holidays: readonly HolidayEntry[]
  isBusinessDay(date: string): boolean
  add(date: string, businessDays: number): string
  between(start: string, end: string): number
  addCalendarHours(start: Date, hours: number): Date
}

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_WEEKEND_DAYS = Object.freeze([0, 6])

const holidayEntrySchema = z.object({
  date: z.string(),
  name: z.string(),
  kind: z.enum(['regular', 'special_non_working', 'local']),
  source: z.string(),
  is_enabled: z.boolean().optional().default(true),
})

export const philippineHolidays: readonly HolidayEntry[] = holidayEntrySchema
  .array()
  .parse(philippineHolidayData)

/**
 * Merge the approved national seed with tenant-maintained rows. Later
 * calendars win for the same date, which lets a tenant explicitly replace or
 * disable a seeded holiday without changing the service implementation.
 */
export function mergeBusinessDayCalendars(
  ...calendars: readonly BusinessDayCalendar[]
): BusinessDayCalendar {
  const holidaysByDate = new Map<string, HolidayEntry>()
  let weekendDays: readonly number[] | undefined

  for (const calendar of calendars) {
    for (const holiday of calendar.holidays) {
      holidaysByDate.set(holiday.date, holiday)
    }
    if (calendar.weekendDays !== undefined) {
      weekendDays = calendar.weekendDays
    }
  }

  return {
    holidays: [...holidaysByDate.values()],
    ...(weekendDays === undefined ? {} : { weekendDays }),
  }
}

function parseDate(date: string): Date {
  if (!ISO_DATE.test(date)) {
    throw new RangeError(`Invalid business date: ${date}`)
  }

  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || formatDate(parsed) !== date) {
    throw new RangeError(`Invalid business date: ${date}`)
  }
  return parsed
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function normalizeCalendar(calendar: BusinessDayCalendar): {
  holidays: readonly HolidayEntry[]
  holidayDates: ReadonlySet<string>
  weekendDays: ReadonlySet<number>
} {
  const holidays = [...calendar.holidays].map((holiday) => {
    parseDate(holiday.date)
    if (!holiday.name.trim()) throw new RangeError('Holiday name cannot be empty')
    if (!holiday.source.trim()) throw new RangeError('Holiday source cannot be empty')
    return { ...holiday }
  })

  const weekendDays = new Set(calendar.weekendDays ?? DEFAULT_WEEKEND_DAYS)
  for (const day of weekendDays) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new RangeError(`Invalid weekend day: ${day}`)
    }
  }

  return {
    holidays: Object.freeze(holidays),
    holidayDates: new Set(
      holidays
        .filter((holiday) => holiday.is_enabled !== false)
        .map((holiday) => holiday.date)
    ),
    weekendDays,
  }
}

export function createBusinessDayService(calendar: BusinessDayCalendar): BusinessDayService {
  const normalized = normalizeCalendar(calendar)

  function isBusinessDay(date: string): boolean {
    const parsed = parseDate(date)
    return (
      !normalized.weekendDays.has(parsed.getUTCDay()) &&
      !normalized.holidayDates.has(date)
    )
  }

  function add(date: string, businessDays: number): string {
    parseDate(date)
    if (!Number.isInteger(businessDays)) {
      throw new RangeError(`Business-day delta must be an integer: ${businessDays}`)
    }

    if (businessDays === 0) return date

    const direction = businessDays > 0 ? 1 : -1
    let remaining = Math.abs(businessDays)
    const cursor = parseDate(date)

    while (remaining > 0) {
      cursor.setUTCDate(cursor.getUTCDate() + direction)
      if (isBusinessDay(formatDate(cursor))) remaining -= 1
    }

    return formatDate(cursor)
  }

  function between(start: string, end: string): number {
    const startDate = parseDate(start)
    const endDate = parseDate(end)
    if (start === end) return 0
    if (startDate > endDate) return -between(end, start)

    let count = 0
    const cursor = new Date(startDate)
    while (cursor < endDate) {
      if (isBusinessDay(formatDate(cursor))) count += 1
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return count
  }

  function addCalendarHours(start: Date, hours: number): Date {
    if (Number.isNaN(start.getTime()) || !Number.isFinite(hours)) {
      throw new RangeError('Calendar-hour arithmetic requires a valid date and finite hours')
    }
    return new Date(start.getTime() + hours * HOUR_MS)
  }

  return {
    holidays: normalized.holidays,
    isBusinessDay,
    add,
    between,
    addCalendarHours,
  }
}

export const philippineBusinessDays = createBusinessDayService({
  holidays: philippineHolidays,
})

export { DAY_MS }
