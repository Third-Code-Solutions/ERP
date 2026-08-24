export interface DashboardOpportunityFilters {
  since?: Date
  until?: Date
  repId?: string
}

export interface DashboardFilterSearchParams {
  since?: string
  until?: string
  rep?: string
}

export interface DashboardFilterParseResult {
  filters: DashboardOpportunityFilters
  errors: string[]
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseUtcDay(value: string, endOfDay: boolean): Date | null {
  const match = ISO_DAY.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(
    Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  )
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

/**
 * URL state is untrusted. Invalid dashboard filters intentionally produce no
 * query filter, so a malformed partial range cannot be mistaken for a valid
 * Sales report.
 */
export function parseDashboardFilters(
  search: DashboardFilterSearchParams
): DashboardFilterParseResult {
  const errors: string[] = []
  const since = search.since ? parseUtcDay(search.since, false) : undefined
  const until = search.until ? parseUtcDay(search.until, true) : undefined

  if ((search.since && !since) || (search.until && !until)) {
    errors.push('Closing date filters must use YYYY-MM-DD.')
  }
  if (since && until && since > until) {
    errors.push('Closing date range is invalid.')
  }
  if (search.rep && !UUID.test(search.rep)) {
    errors.push('Sales representative filter is invalid.')
  }

  if (errors.length > 0) return { filters: {}, errors }

  return {
    filters: {
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
      ...(search.rep ? { repId: search.rep } : {}),
    },
    errors,
  }
}
