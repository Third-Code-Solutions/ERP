import { describe, expect, it } from 'vitest'
import { createBusinessDayService } from '@third-code-erp/shared-types'

import { getSlaProgress, parseSlaConfig, slaBreachAt, type SlaConfig } from './sla-clock-utils'

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

describe('slaBreachAt', () => {
  function businessDays(total: number): SlaConfig {
    return { clock_type: 'business_days', breach_business_days: total, warning_at_pct: 0.8 }
  }

  it.each([
    ['a Monday start breaches when Friday ends', '2026-09-07T17:00:00+08:00', 5, '2026-09-12T00:00:00+08:00'],
    ['a Saturday start counts from Monday', '2026-09-05T10:00:00+08:00', 5, '2026-09-12T00:00:00+08:00'],
    ['a Friday start skips the weekend', '2026-09-11T09:00:00+08:00', 2, '2026-09-15T00:00:00+08:00'],
    ['a national holiday is skipped (Bonifacio Day, Mon 30 Nov)', '2026-11-26T09:00:00+08:00', 3, '2026-12-02T00:00:00+08:00'],
    ['a one-day clock breaches at the next Manila midnight', '2026-09-07T23:30:00+08:00', 1, '2026-09-08T00:00:00+08:00'],
    ['a UTC start late on Sunday is a Monday start in Manila', '2026-09-06T17:00:00Z', 1, '2026-09-08T00:00:00+08:00'],
  ])('%s', (_case, start, total, expected) => {
    expect(slaBreachAt(businessDays(total), new Date(start)).toISOString()).toBe(new Date(expected).toISOString())
  })

  it('uses the tenant calendar it is given', () => {
    const tenantCalendar = createBusinessDayService({
      holidays: [{ date: '2026-09-09', name: 'Tenant shutdown', kind: 'local', source: 'tenant calendar' }],
    })

    expect(slaBreachAt(businessDays(5), new Date('2026-09-07T09:00:00+08:00'), tenantCalendar).toISOString()).toBe(
      new Date('2026-09-15T00:00:00+08:00').toISOString()
    )
  })

  it('adds calendar hours exactly', () => {
    const config: SlaConfig = { clock_type: 'calendar_hours', breach_at_seconds: 4 * 3600, warning_at_pct: 0.8 }
    expect(slaBreachAt(config, new Date('2026-09-07T01:00:00Z')).toISOString()).toBe('2026-09-07T05:00:00.000Z')
  })

  it('agrees with getSlaProgress: elapsed reaches total exactly at the breach instant', () => {
    // Starts every 7 hours across weekends and the 30 Nov and 8 Dec holidays.
    for (let start = Date.parse('2026-11-20T00:00:00+08:00'); start < Date.parse('2026-12-12T00:00:00+08:00'); start += 7 * 3600_000) {
      for (let total = 1; total <= 6; total += 1) {
        const config = businessDays(total)
        const breach = slaBreachAt(config, new Date(start)).getTime()
        const before = getSlaProgress(config, new Date(start), new Date(breach - 1))
        const at = getSlaProgress(config, new Date(start), new Date(breach))
        expect(before.elapsed, new Date(start).toISOString()).toBeLessThan(total)
        expect(at.elapsed, new Date(start).toISOString()).toBeGreaterThanOrEqual(total)
      }
    }
  })
})
