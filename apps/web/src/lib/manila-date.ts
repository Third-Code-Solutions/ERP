/**
 * Philippine calendar helpers. Manila is UTC+8 with no daylight saving, so a
 * business "today" before 08:00 Manila is still the previous UTC date; screens
 * that default a posting date from `toISOString()` therefore offer yesterday.
 */
const MANILA_TIME_ZONE = 'Asia/Manila'
const MS_PER_DAY = 86_400_000

const calendarDateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Manila calendar date (YYYY-MM-DD) of an instant; defaults to now. */
export function manilaToday(instant: Date = new Date()): string {
  const parts = Object.fromEntries(
    calendarDateParts
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** Whole days from `earlier` to `later`; both are YYYY-MM-DD calendar dates. */
export function calendarDaysBetween(later: string, earlier: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) /
      MS_PER_DAY
  )
}

/** Date and time of an event, shown in Manila time whatever the server zone. */
export function formatManilaDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: MANILA_TIME_ZONE,
  }).format(new Date(value))
}

/** Calendar date of an instant, shown in Manila time. */
export function formatManilaDate(value: Date | string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: MANILA_TIME_ZONE,
  }).format(new Date(value))
}
