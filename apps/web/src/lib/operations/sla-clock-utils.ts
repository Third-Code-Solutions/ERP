import {
  type BusinessDayService,
  philippineBusinessDays,
} from '@third-code-erp/shared-types'
import { formatInTimeZone } from 'date-fns-tz'
import { z } from 'zod'

const PHILIPPINE_TIME_ZONE = 'Asia/Manila'

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

function dateInPhilippines(value: Date): string {
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
