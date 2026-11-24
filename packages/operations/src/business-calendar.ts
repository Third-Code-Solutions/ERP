import type { Database } from '@third-code-erp/database'
import { businessCalendarHolidays } from '@third-code-erp/database/schema'
import {
  createBusinessDayService,
  mergeBusinessDayCalendars,
  philippineHolidays,
  type BusinessDayService,
  type HolidayEntry,
} from '@third-code-erp/shared-types'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const holidayRowSchema = z.object({
  holiday_date: z.string(),
  name: z.string(),
  kind: z.enum(['regular', 'special_non_working', 'local']),
  source: z.string(),
  is_enabled: z.boolean(),
})

export async function resolveAwardBusinessDayService(
  tx: DatabaseTransaction,
  tenantId: string
): Promise<BusinessDayService> {
  const parsedTenantId = z.string().guid().parse(tenantId)
  const rows: HolidayEntry[] = []
  if (process.env.BUSINESS_CALENDAR_DB_ENABLED === '1') {
    const persisted = await tx
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
    for (const persistedRow of persisted) {
      const row = holidayRowSchema.parse(persistedRow)
      rows.push({
        date: row.holiday_date,
        name: row.name,
        kind: row.kind,
        source: row.source,
        is_enabled: row.is_enabled,
      })
    }
  }
  return createBusinessDayService(
    mergeBusinessDayCalendars(
      { holidays: philippineHolidays },
      { holidays: rows }
    )
  )
}
