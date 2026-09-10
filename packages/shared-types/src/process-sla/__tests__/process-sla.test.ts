import { describe, expect, it } from 'vitest'

import {
  approvalRoutePreviewQuerySchema,
  approvalRoutePreviewResultSchema,
  canEscalateSlaClock,
  createSlaClockSchedule,
  evaluateSlaClock,
  processTaskQueueQuerySchema,
  processTaskQueueResultSchema,
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

  it('defines a strict, trimmed approval-route preview query', () => {
    expect(
      approvalRoutePreviewQuerySchema.safeParse({
        objectType: ' purchase_order ',
        amountCentavos: '9007199254740993',
      })
    ).toEqual({
      success: true,
      data: {
        objectType: 'purchase_order',
        amountCentavos: '9007199254740993',
      },
    })
    expect(
      approvalRoutePreviewQuerySchema.safeParse({
        objectType: 'purchase_order',
        amountCentavos: '1.00',
      }).success
    ).toBe(false)
    expect(
      approvalRoutePreviewQuerySchema.safeParse({
        objectType: 'purchase_order',
        amountCentavos: '0',
        extra: true,
      }).success
    ).toBe(false)
  })

  it('keeps the approval-route preview result contract strict and literal', () => {
    const result = approvalRoutePreviewResultSchema.safeParse({
      objectType: 'purchase_order',
      amountCentavos: '0',
      mode: 'preview_only',
      authority: 'configured_rules_only',
      status: 'matched',
      steps: [
        {
          sequence: 10,
          status: 'matched',
          rules: [],
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(
      approvalRoutePreviewResultSchema.safeParse({
        objectType: 'purchase_order',
        amountCentavos: '0',
        mode: 'live',
        authority: 'configured_rules_only',
        status: 'matched',
        steps: [],
      }).success
    ).toBe(false)
  })

  it('defines a strict task-queue query with bounded pagination and trimmed BU', () => {
    expect(
      processTaskQueueQuerySchema.safeParse({
        status: 'blocked',
        responsibleBu: '  Commercial  ',
        page: '100000',
        limit: '100',
      })
    ).toEqual({
      success: true,
      data: {
        status: 'blocked',
        responsibleBu: 'Commercial',
        page: 100000,
        limit: 100,
      },
    })
    expect(processTaskQueueQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 25,
    })
    expect(
      processTaskQueueQuerySchema.safeParse({
        responsibleBu: '   ',
      }).success
    ).toBe(false)
    expect(
      processTaskQueueQuerySchema.safeParse({ status: 'unknown' }).success
    ).toBe(false)
    expect(
      processTaskQueueQuerySchema.safeParse({ page: 100001 }).success
    ).toBe(false)
    expect(
      processTaskQueueQuerySchema.safeParse({ limit: 101 }).success
    ).toBe(false)
    expect(
      processTaskQueueQuerySchema.safeParse({ unexpected: true }).success
    ).toBe(false)
  })

  it('accepts both unassigned/no-clock and external observe-mode queue rows', () => {
    const result = processTaskQueueResultSchema.safeParse({
      tenantId: '22222222-2222-4222-8222-222222222222',
      rows: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          processStepId: '33333333-3333-4333-8333-333333333333',
          processStepCode: 'PR-L',
          processStepName: 'Lead qualification',
          responsibleBu: 'Sales',
          subjectType: 'opportunity',
          subjectId: '77777777-7777-4777-8777-777777777777',
          instanceKey: 'opportunity:777:PR-L',
          assignedTo: null,
          status: 'pending',
          blockedReason: null,
          startedAt: null,
          completedAt: null,
          createdAt: '2026-08-12T00:00:00.000Z',
          updatedAt: '2026-08-12T00:00:00.000Z',
          clock: null,
        },
        {
          id: '44444444-4444-4444-8444-444444444445',
          processStepId: '33333333-3333-4333-8333-333333333333',
          processStepCode: 'LGU-PERMIT',
          processStepName: 'LGU permit return',
          responsibleBu: 'SD',
          subjectType: 'project',
          subjectId: '77777777-7777-4777-8777-777777777778',
          instanceKey: 'project:778:LGU-PERMIT',
          assignedTo: '66666666-6666-4666-8666-666666666666',
          status: 'in_progress',
          blockedReason: null,
          startedAt: '2026-08-12T00:00:00.000Z',
          completedAt: null,
          createdAt: '2026-08-12T00:00:00.000Z',
          updatedAt: '2026-08-12T01:00:00.000Z',
          clock: {
            id: '55555555-5555-4555-8555-555555555555',
            clockType: 'calendar_hours',
            clockScope: 'external',
            targetValue: 24,
            startedAt: '2026-08-12T00:00:00.000Z',
            dueAt: '2026-08-13T00:00:00.000Z',
            atRiskAt: '2026-08-12T19:12:00.000Z',
            breachedAt: '2026-08-13T00:00:00.000Z',
            escalatedAt: null,
            status: 'breached',
            observeMode: true,
          },
        },
      ],
      total: 2,
      page: 1,
      limit: 25,
      totalPages: 1,
    })

    expect(result.success).toBe(true)
    expect(
      processTaskQueueResultSchema.safeParse({
        tenantId: '22222222-2222-4222-8222-222222222222',
        rows: [],
        total: 0,
        page: 1,
        limit: 25,
        totalPages: 1,
        extra: true,
      }).success
    ).toBe(false)
  })
})
