import {
  type BusinessDayService,
  philippineBusinessDays,
} from '@third-code-erp/shared-types'
import { formatInTimeZone } from 'date-fns-tz'
import { z } from 'zod'

const PHILIPPINE_TIME_ZONE = 'Asia/Manila'
const DAY_MS = 24 * 60 * 60 * 1000

const businessDayConfigSchema = z.object({
  clock_type: z.literal('business_days'),
  breach_business_days: z.number().int().positive(),
  warning_at_pct: z.number().gt(0).lte(1),
})

const calendarHourConfigSchema = z.object({
  clock_type: z.literal('calendar_hours'),
  breach_at_seconds: z.number().int().positive(),
  warning_at_pct: z.number().gt(0).lte(1),
})

const legacyCalendarConfigSchema = z.object({
  breach_at_seconds: z.number().int().positive(),
  warning_at_pct: z.number().gt(0).lte(1),
})

export const slaConfigSchema = z.discriminatedUnion('clock_type', [
  businessDayConfigSchema,
  calendarHourConfigSchema,
])

export type SlaConfig = z.infer<typeof slaConfigSchema>

export type SlaProgress = {
  elapsed: number
  total: number
  warning_at: number
  unit: 'business_days' | 'calendar_hours'
}

export function parseSlaConfig(raw: unknown): SlaConfig | null {
  const parsed = slaConfigSchema.safeParse(raw)
  if (parsed.success) return parsed.data

  const legacy = legacyCalendarConfigSchema.safeParse(raw)
  if (!legacy.success) return null
  return {
    clock_type: 'calendar_hours',
    breach_at_seconds: legacy.data.breach_at_seconds,
    warning_at_pct: legacy.data.warning_at_pct,
  }
}

export function dateInPhilippines(value: Date): string {
  return formatInTimeZone(value, PHILIPPINE_TIME_ZONE, 'yyyy-MM-dd')
}

export function getSlaProgress(
  config: SlaConfig,
  startedAt: Date,
  now: Date,
  businessDays: BusinessDayService = philippineBusinessDays
): SlaProgress {
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(now.getTime())) {
    throw new RangeError('SLA progress requires valid dates')
  }

  if (config.clock_type === 'business_days') {
    const elapsed = Math.max(
      0,
      businessDays.between(dateInPhilippines(startedAt), dateInPhilippines(now))
    )
    return {
      elapsed,
      total: config.breach_business_days,
      warning_at: config.breach_business_days * config.warning_at_pct,
      unit: 'business_days',
    }
  }

  const elapsed = Math.max(0, (now.getTime() - startedAt.getTime()) / (60 * 60 * 1000))
  return {
    elapsed,
    total: config.breach_at_seconds / (60 * 60),
    warning_at: (config.breach_at_seconds / (60 * 60)) * config.warning_at_pct,
    unit: 'calendar_hours',
  }
}

/**
 * The instant a clock breaches: from then on getSlaProgress reports elapsed >=
 * total. Business days are counted over [start day, today), so a business-day
 * clock breaches at the Manila midnight after its total-th business day,
 * counting the start day when it is a business day itself.
 */
export function slaBreachAt(
  config: SlaConfig,
  startedAt: Date,
  businessDays: BusinessDayService = philippineBusinessDays
): Date {
  if (Number.isNaN(startedAt.getTime())) {
    throw new RangeError('SLA breach time requires a valid start')
  }
  if (config.clock_type === 'calendar_hours') {
    return new Date(startedAt.getTime() + config.breach_at_seconds * 1000)
  }
  const start = dateInPhilippines(startedAt)
  const total = config.breach_business_days
  const lastDay = businessDays.add(start, businessDays.isBusinessDay(start) ? total - 1 : total)
  // Manila has no daylight saving, so the next midnight is 24 hours later.
  return new Date(new Date(`${lastDay}T00:00:00+08:00`).getTime() + DAY_MS)
}
