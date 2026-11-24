import { describe, expect, it } from 'vitest'

import {
  buildOpenDeadlines,
  deadlineHref,
  deadlineLabel,
  deadlineSubject,
  formatDeadlineRemaining,
  subjectKey,
  summarizeDeadlines,
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
  it.each([
    ['2026-09-10T10:00:00+08:00', 'on_track', '2 business days left'],
    ['2026-09-11T10:00:00+08:00', 'at_risk', '1 business day left'],
    ['2026-09-14T10:00:00+08:00', 'overdue', 'Deadline reached today'],
    ['2026-09-16T10:00:00+08:00', 'overdue', '2 business days overdue'],
  ])('computes a business-day clock at %s as %s', (now, status, text) => {
    const [deadline] = build([row()], now)

    expect(deadline?.status).toBe(status)
    expect(formatDeadlineRemaining(deadline!)).toBe(text)
    expect(deadline?.dueAt.toISOString()).toBe(new Date('2026-09-14T00:00:00+08:00').toISOString())
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

  it('hides a row whose link the viewer may not open but keeps rows with no link', () => {
    const rows = [
      row({ id: 'punch', entity_type: 'punchlist_item', sla_label: 'punchlist.due_date' }),
      row({ id: 'unknown', entity_type: 'purchase_order', sla_label: 'po.commercial_approval' }),
    ]

    const deadlines = build(rows, '2026-09-08T10:00:00+08:00', {
      canView: (href) => !href.startsWith('/punchlist'),
    })

    expect(deadlines.map((item) => item.id)).toEqual(['unknown'])
    expect(deadlines[0]).toMatchObject({ href: null, subject: 'Purchase order', label: 'Purchase order commercial approval' })
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
