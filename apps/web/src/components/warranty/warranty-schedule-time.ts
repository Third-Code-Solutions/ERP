const MANILA_UTC_OFFSET_HOURS = 8
const MANILA_OFFSET_SUFFIX = '+08:00'

export function toManilaDateTimeInput(isoTimestamp: string | null): string {
  if (!isoTimestamp) return ''

  const instant = new Date(isoTimestamp)
  if (Number.isNaN(instant.getTime())) return ''

  return new Date(instant.getTime() + MANILA_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
}

export function fromManilaDateTimeInput(localDateTime: string): string {
  return `${localDateTime}:00${MANILA_OFFSET_SUFFIX}`
}
