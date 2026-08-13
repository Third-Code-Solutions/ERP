import { describe, expect, it } from 'vitest'

import {
  canEscalateSlaClock,
  createSlaClockSchedule,
  evaluateSlaClock,
  updateTaskStatusCommandSchema,
} from '..'
import { philippineBusinessDays } from '../../business-days'

describe('M-06 process SLA clock contracts', () => {
  it('uses business-day arithmetic across year boundaries and holidays', () => {
    const schedule = createSlaClockSchedule({
      clock_type: 'business_days',
      clock_scope: 'internal',
      target_value: 2,
      started_at: new Date('2025-12-31T02:00:00.000Z'),
      observe_mode: false,
    })

    expect(schedule.due_at.toISOString()).toBe('2026-01-05T02:00:00.000Z')
    expect(schedule.at_risk_at.toISOString()).toBe('2026-01-05T02:00:00.000Z')
    expect(schedule.escalation_at?.toISOString()).toBe('2026-01-06T02:00:00.000Z')
  })

  it('rounds business-day threshold boundaries up and skips Holy Week', () => {
    const schedule = createSlaClockSchedule({
      clock_type: 'business_days',
      clock_scope: 'internal',
      target_value: 5,
      started_at: new Date('2026-04-01T02:00:00.000Z'),
      observe_mode: true,
    })

    expect(schedule.at_risk_at.toISOString()).toBe('2026-04-10T02:00:00.000Z')
    expect(schedule.due_at.toISOString()).toBe('2026-04-13T02:00:00.000Z')
    expect(schedule.escalation_at?.toISOString()).toBe('2026-04-16T02:00:00.000Z')
    expect(philippineBusinessDays.isBusinessDay('2026-04-03')).toBe(false)
  })

  it('keeps calendar-hour clocks independent from business-day calendars', () => {
    const schedule = createSlaClockSchedule({
      clock_type: 'calendar_hours',
      clock_scope: 'internal',
      target_value: 48,
      started_at: new Date('2026-04-02T10:00:00.000Z'),
      observe_mode: false,
    })

    expect(schedule.at_risk_at.toISOString()).toBe('2026-04-04T00:24:00.000Z')
    expect(schedule.due_at.toISOString()).toBe('2026-04-04T10:00:00.000Z')
    expect(schedule.escalation_at?.toISOString()).toBe('2026-04-05T10:00:00.000Z')
  })

  it('tracks external breaches without an escalation path', () => {
    const schedule = createSlaClockSchedule({
      clock_type: 'calendar_hours',
      clock_scope: 'external',
      target_value: 24,
      started_at: new Date('2026-04-02T10:00:00.000Z'),
      observe_mode: false,
    })

    expect(schedule.escalation_at).toBeNull()
    expect(canEscalateSlaClock('external', false)).toBe(false)
    expect(
      evaluateSlaClock(schedule, new Date('2026-04-04T10:00:00.000Z'))
    ).toMatchObject({
      phase: 'breached',
      is_breached: true,
      should_escalate: false,
    })
  })

  it('keeps internal escalation observational until enforcement is enabled', () => {
    const observed = createSlaClockSchedule({
      clock_type: 'calendar_hours',
      clock_scope: 'internal',
      target_value: 24,
      started_at: new Date('2026-04-02T10:00:00.000Z'),
      observe_mode: true,
    })
    const evaluation = evaluateSlaClock(
      observed,
      new Date('2026-04-04T22:00:00.000Z')
    )

    expect(evaluation).toMatchObject({
      phase: 'breached',
      is_breached: true,
      should_escalate: false,
      observe_mode: true,
    })
    expect(canEscalateSlaClock('internal', true)).toBe(false)
    expect(canEscalateSlaClock('internal', false)).toBe(true)
  })

  it('requires blocked-task reasons and rejects unrelated reason payloads', () => {
    expect(
      updateTaskStatusCommandSchema.safeParse({ status: 'blocked' }).success
    ).toBe(false)
    expect(
      updateTaskStatusCommandSchema.safeParse({
        status: 'blocked',
        blockedReason: 'Waiting for client evidence',
      }).success
    ).toBe(true)
    expect(
      updateTaskStatusCommandSchema.safeParse({
        status: 'completed',
        blockedReason: 'not applicable',
      }).success
    ).toBe(false)
  })
})
