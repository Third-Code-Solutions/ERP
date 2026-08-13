import {
  businessCalendarHolidays,
  db,
} from '@third-code-erp/database'
import {
  createBusinessDayService,
  mergeBusinessDayCalendars,
  philippineHolidays,
  type BusinessDayService,
  type HolidayEntry,
} from '@third-code-erp/shared-types'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

const tenantIdSchema = z.string().uuid()
const BUSINESS_CALENDAR_DB_ENABLED = '1'

const holidayRowSchema = z.object({
  holiday_date: z.string(),
  name: z.string(),
  kind: z.enum(['regular', 'special_non_working', 'local']),
  source: z.string(),
  is_enabled: z.boolean(),
})

/**
 * Build the effective calendar from persisted tenant rows plus the approved
 * national seed. Disabled tenant rows are retained as date overrides so a
 * tenant can explicitly opt out of a seeded holiday.
 */
export function createTenantBusinessDayService(
  rows: readonly HolidayEntry[]
): BusinessDayService {
  return createBusinessDayService(
    mergeBusinessDayCalendars(
      { holidays: philippineHolidays },
      { holidays: rows }
    )
  )
}

/**
 * The persisted-calendar rollout is deliberately explicit. Before the
 * additive table is applied and checked, the national seed remains the
 * deterministic runtime calendar. Once BUSINESS_CALENDAR_DB_ENABLED=1 is
 * set, a missing or malformed table is surfaced instead of hidden.
 */
export function isPersistedBusinessCalendarEnabled(): boolean {
  return process.env.BUSINESS_CALENDAR_DB_ENABLED === BUSINESS_CALENDAR_DB_ENABLED
}

export async function resolveTenantBusinessDayService(
  tenantId: string
): Promise<BusinessDayService> {
  if (!isPersistedBusinessCalendarEnabled()) {
    return createTenantBusinessDayService([])
  }
  return loadTenantBusinessDayService(tenantId)
}

/**
 * Load the tenant calendar through the server database boundary. A missing
 * table is intentionally surfaced; silently falling back here would make the
 * UI claim editable calendar data while running against an unapplied schema.
 */
export async function loadTenantBusinessDayService(
  tenantId: string
): Promise<BusinessDayService> {
  const parsedTenantId = tenantIdSchema.parse(tenantId)
  const rows = await db
    .select({
      holiday_date: businessCalendarHolidays.holiday_date,
      name: businessCalendarHolidays.name,
      kind: businessCalendarHolidays.kind,
      source: businessCalendarHolidays.source,
      is_enabled: businessCalendarHolidays.is_enabled,
    })
    .from(businessCalendarHolidays)
    .where(eq(businessCalendarHolidays.tenant_id, parsedTenantId))
    .orderBy(asc(businessCalendarHolidays.holiday_date))

  const validatedRows = rows.map((row) => holidayRowSchema.parse(row))
  return createTenantBusinessDayService(
    validatedRows.map((row) => ({
      date: row.holiday_date,
      name: row.name,
      kind: row.kind,
      source: row.source,
      is_enabled: row.is_enabled,
    }))
  )
}
