// Manila is UTC+8 with no DST. Keep the API read authority aligned with the
// existing Web cadence calculations without trusting a browser-provided clock.
const MANILA_OFFSET_HOURS = 8

function manilaDayAt(date: Date, hour: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const d = date.getUTCDate()
  return new Date(Date.UTC(y, m, d, hour - MANILA_OFFSET_HOURS, 0, 0, 0))
}

export function manilaTodayBoundaries(date: Date): {
  startOfDay: Date
  endOfDay: Date
} {
  const startOfDay = manilaDayAt(date, 0)
  const endOfDay = new Date(manilaDayAt(date, 24).getTime() - 1)
  return { startOfDay, endOfDay }
}
