const MANILA_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })

/** Today's Manila calendar date as YYYY-MM-DD. Server clocks run in UTC, so `toISOString()` is a day behind before 08:00 Manila. */
export function manilaToday(now: Date = new Date()): string {
  return MANILA_DATE.format(now)
}
