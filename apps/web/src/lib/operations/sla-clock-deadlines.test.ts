import { describe, expect, it } from 'vitest'

import {
  buildOpenDeadlines,
  deadlineHref,
  deadlineLabel,
  deadlineSubject,
  formatDeadlineRemaining,
  subjectKey,
  summarizeDeadlines,
  visibleDeadlineEntityTypes,
  type DeadlineSubjectLookup,
  type OpenSlaLogRow,
} from './sla-clock-deadlines'

const BUSINESS_5_DAYS = {
  clock_type: 'business_days',
  breach_business_days: 5,
  warning_at_pct: 0.8,
}
const CALENDAR_24_HOURS = {
  clock_type: 'calendar_hours',
  breach_at_seconds: 24 * 3600,
  warning_at_pct: 0.8,
}

// Monday; no Philippine holiday in this week or the next.
const MONDAY_START = new Date('2026-09-07T09:00:00+08:00')

function row(overrides: Partial<OpenSlaLogRow> = {}): OpenSlaLogRow {
  return {
    id: 'log-1',
    entity_type: 'opportunity',
    entity_id: '11111111-1111-4111-8111-111111111111',
    sla_label: 'opp.stage_response',
    started_at: MONDAY_START,
    sla_seconds: BUSINESS_5_DAYS,
    ...overrides,
  }
}

const NO_SUBJECTS: DeadlineSubjectLookup = new Map()
const allowAll = () => true

function build(rows: OpenSlaLogRow[], now: string, extra: Partial<Parameters<typeof buildOpenDeadlines>[0]> = {}) {
  return buildOpenDeadlines({
    rows,
    now: new Date(now),
    subjects: NO_SUBJECTS,
    canView: allowAll,
    ...extra,
  })
}

describe('open deadlines status', () => {
  // Started Monday 7 Sep with 5 business days: the window is Mon-Fri, so it breaches as Friday ends.
  it.each([
    ['2026-09-10T10:00:00+08:00', 'on_track', '2 business days left'],
    ['2026-09-11T10:00:00+08:00', 'at_risk', '1 business day left'],
    ['2026-09-12T10:00:00+08:00', 'overdue', 'Deadline passed'],
    ['2026-09-14T10:00:00+08:00', 'overdue', 'Deadline passed'],
    ['2026-09-16T10:00:00+08:00', 'overdue', '2 business days overdue'],
  ])('computes a business-day clock at %s as %s', (now, status, text) => {
    const [deadline] = build([row()], now)

    expect(deadline?.status).toBe(status)
    expect(formatDeadlineRemaining(deadline!)).toBe(text)
    expect(deadline?.dueAt.toISOString()).toBe(new Date('2026-09-12T00:00:00+08:00').toISOString())
    expect(deadline!.status === 'overdue').toBe(new Date(now) >= deadline!.dueAt)
  })

  it('does not count the weekend a clock started on', () => {
    const saturdayStart = row({ started_at: new Date('2026-09-05T10:00:00+08:00') })

    const friday = build([saturdayStart], '2026-09-11T10:00:00+08:00')[0]!
    expect(friday).toMatchObject({ status: 'at_risk' })
    expect(formatDeadlineRemaining(friday)).toBe('1 business day left')
    expect(friday.dueAt.toISOString()).toBe(new Date('2026-09-12T00:00:00+08:00').toISOString())
    expect(build([saturdayStart], '2026-09-12T00:00:00+08:00')[0]?.status).toBe('overdue')
  })

  it('moves the due date past a national holiday', () => {
    // Thu 26 Nov, 3 business days: Thu, Fri, then Tue 1 Dec (Mon 30 Nov is Bonifacio Day).
    const holidayRow = row({ started_at: new Date('2026-11-26T09:00:00+08:00') })

    const threeDays = { ...BUSINESS_5_DAYS, breach_business_days: 3 }

    const tuesday = build([{ ...holidayRow, sla_seconds: threeDays }], '2026-12-01T15:00:00+08:00')[0]!
    expect(tuesday.status).toBe('on_track')
    expect(formatDeadlineRemaining(tuesday)).toBe('1 business day left')
    expect(tuesday.dueAt.toISOString()).toBe(new Date('2026-12-02T00:00:00+08:00').toISOString())
    expect(build([{ ...holidayRow, sla_seconds: threeDays }], '2026-12-02T08:00:00+08:00')[0]?.status).toBe('overdue')
  })

  it('computes a calendar-hour clock from the stored start and the request time', () => {
    const calendarRow = row({
      sla_label: 'ticket.acknowledge',
      entity_type: 'warranty_ticket',
      sla_seconds: CALENDAR_24_HOURS,
      started_at: new Date('2026-09-07T01:00:00Z'),
    })

    const atRisk = build([calendarRow], '2026-09-07T21:00:00Z')[0]!
    expect(atRisk.status).toBe('at_risk')
    expect(formatDeadlineRemaining(atRisk)).toBe('4 hours left')
    expect(atRisk.dueAt.toISOString()).toBe('2026-09-08T01:00:00.000Z')

    const overdue = build([calendarRow], '2026-09-08T02:00:00Z')[0]!
    expect(overdue.status).toBe('overdue')
    expect(formatDeadlineRemaining(overdue)).toBe('1 hour overdue')
  })

  it('does not trust warned_at or breached_at, only the stored clock and now', () => {
    const stale = { ...row(), warned_at: new Date(), breached_at: new Date() }
    expect(build([stale], '2026-09-08T10:00:00+08:00')[0]?.status).toBe('on_track')
  })

  it('skips a row whose clock config cannot be read', () => {
    expect(build([row({ sla_seconds: { nope: true } }), row({ id: 'ok' })], '2026-09-08T10:00:00+08:00').map((item) => item.id)).toEqual(['ok'])
  })
})

describe('open deadlines ordering and visibility', () => {
  it('lists overdue first, then at risk, then on track, each by due time', () => {
    const rows = [
      row({ id: 'on-track', started_at: new Date('2026-09-09T09:00:00+08:00') }),
      row({ id: 'overdue-newer', started_at: new Date('2026-09-02T09:00:00+08:00') }),
      row({ id: 'overdue-older', started_at: new Date('2026-08-26T09:00:00+08:00') }),
      row({ id: 'at-risk', started_at: new Date('2026-09-04T09:00:00+08:00') }),
    ]

    const deadlines = build(rows, '2026-09-10T10:00:00+08:00')

    expect(deadlines.map((item) => item.id)).toEqual(['overdue-older', 'overdue-newer', 'at-risk', 'on-track'])
    expect(summarizeDeadlines(deadlines)).toEqual({ overdue: 2, at_risk: 1, on_track: 1 })
  })

  it('hides a row whose subject the viewer may not open, and every type it has no gate for', () => {
    const rows = [
      row({ id: 'punch', entity_type: 'punchlist_item', sla_label: 'punchlist.due_date' }),
      row({ id: 'unknown', entity_type: 'purchase_order', sla_label: 'po.commercial_approval' }),
      row({ id: 'opportunity' }),
    ]

    const deadlines = build(rows, '2026-09-08T10:00:00+08:00', {
      canView: (href) => !href.startsWith('/punchlist'),
    })

    expect(deadlines.map((item) => item.id)).toEqual(['opportunity'])
  })

  it('gates an unlinked permit by the permits page instead of showing it to everyone', () => {
    const permit = row({ id: 'permit', entity_type: 'permit', sla_label: 'permit.status_update' })

    expect(build([permit], '2026-09-08T10:00:00+08:00', { canView: (href) => href !== '/permits' })).toEqual([])
    expect(build([permit], '2026-09-08T10:00:00+08:00')[0]).toMatchObject({ id: 'permit', href: null, subject: 'Permit' })
  })

  it('lists the subject types a role may read', () => {
    expect(visibleDeadlineEntityTypes((href) => href === '/crm/opportunities' || href === '/tasks')).toEqual([
      'opportunity',
      'daily_task',
    ])
    expect(visibleDeadlineEntityTypes(() => false)).toEqual([])
  })

  it('carries the looked-up subject name and resolves project links', () => {
    const permitId = '22222222-2222-4222-8222-222222222222'
    const subjects: DeadlineSubjectLookup = new Map([
      [subjectKey('permit', permitId), { projectId: 'project-9', name: 'Building admin vetting' }],
    ])

    const [deadline] = build(
      [row({ entity_type: 'permit', entity_id: permitId, sla_label: 'permit.status_update' })],
      '2026-09-08T10:00:00+08:00',
      { subjects }
    )

    expect(deadline).toMatchObject({
      href: '/projects/project-9/permits',
      subject: 'Permit',
      subjectName: 'Building admin vetting',
    })
  })
})

describe('open deadline links and labels', () => {
  const id = '33333333-3333-4333-8333-333333333333'

  it.each([
    ['opportunity', null, `/crm/opportunities/${id}`],
    ['punchlist_item', null, `/punchlist/${id}`],
    ['warranty_ticket', null, `/warranty/${id}`],
    ['daily_task', null, '/tasks'],
    ['permit', 'p1', '/projects/p1/permits'],
    ['permit', null, null],
    ['pre_con_checklist_item', 'p1', '/projects/p1/checklist'],
    ['pre_con_checklist_item', null, null],
    ['something_new', 'p1', null],
  ])('maps %s (project %s) to %s', (entityType, projectId, expected) => {
    expect(deadlineHref(entityType, id, projectId)).toBe(expected)
  })

  it('names known labels and subjects and humanizes unknown ones', () => {
    expect(deadlineLabel('punchlist.due_date')).toBe('Punchlist item due')
    expect(deadlineLabel('custom.some_label')).toBe('Custom some label')
    expect(deadlineSubject('pre_con_checklist_item')).toBe('Checklist item')
    expect(deadlineSubject('site_diary')).toBe('Site diary')
  })

  it('words longer calendar clocks in days', () => {
    expect(formatDeadlineRemaining({ remaining: 72, unit: 'calendar_hours' })).toBe('3 days left')
    expect(formatDeadlineRemaining({ remaining: -0.5, unit: 'calendar_hours' })).toBe('Less than an hour overdue')
    expect(formatDeadlineRemaining({ remaining: 1, unit: 'business_days' })).toBe('1 business day left')
  })
})
