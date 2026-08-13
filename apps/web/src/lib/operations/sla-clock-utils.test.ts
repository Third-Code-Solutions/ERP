import { describe, expect, it } from 'vitest'
import { createBusinessDayService } from '@third-code-erp/shared-types'

import { getSlaProgress, parseSlaConfig } from './sla-clock-utils'

describe('SLA clock semantics', () => {
  it('counts Philippine business days and skips Holy Week', () => {
    const config = parseSlaConfig({
      clock_type: 'business_days',
      breach_business_days: 3,
      warning_at_pct: 0.8,
    })

    expect(config).not.toBeNull()
    const progress = getSlaProgress(
      config!,
      new Date('2026-04-01T09:00:00+08:00'),
      new Date('2026-04-07T09:00:00+08:00')
    )
    expect(progress).toMatchObject({
      elapsed: 2,
      total: 3,
      unit: 'business_days',
    })
    expect(progress.warning_at).toBeCloseTo(2.4, 10)
  })

  it('keeps CX calendar-hour clocks independent from holidays', () => {
    const config = parseSlaConfig({
      clock_type: 'calendar_hours',
      breach_at_seconds: 48 * 60 * 60,
      warning_at_pct: 0.8,
    })

    expect(config).not.toBeNull()
    expect(
      getSlaProgress(
        config!,
        new Date('2026-04-02T10:00:00Z'),
        new Date('2026-04-04T10:00:00Z')
      )
    ).toMatchObject({
      elapsed: 48,
      total: 48,
      unit: 'calendar_hours',
    })
  })

  it('reads legacy calendar-hour JSON without silently changing its meaning', () => {
    expect(
      parseSlaConfig({ breach_at_seconds: 86_400, warning_at_pct: 0.8 })
    ).toEqual({
      clock_type: 'calendar_hours',
      breach_at_seconds: 86_400,
      warning_at_pct: 0.8,
    })
  })

  it('accepts a tenant-maintained calendar at evaluation time', () => {
    const config = parseSlaConfig({
      clock_type: 'business_days',
      breach_business_days: 1,
      warning_at_pct: 0.8,
    })
    const tenantCalendar = createBusinessDayService({
      holidays: [
        {
          date: '2026-04-06',
          name: 'Tenant shutdown',
          kind: 'local',
          source: 'tenant calendar',
        },
      ],
    })

    expect(
      getSlaProgress(
        config!,
        new Date('2026-04-04T09:00:00+08:00'),
        new Date('2026-04-07T09:00:00+08:00'),
        tenantCalendar
      ).elapsed
    ).toBe(0)
  })

  it('rejects malformed or ambiguous SLA configuration', () => {
    expect(parseSlaConfig({ clock_type: 'business_days', breach_business_days: 0 })).toBeNull()
    expect(parseSlaConfig({ breach_at_seconds: '86400', warning_at_pct: 0.8 })).toBeNull()
  })
})
