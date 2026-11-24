import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./retry', () => ({
  ProcessRetry: ({ label = 'Try again' }: { label?: string }) => <button>{label}</button>,
}))

import type { OpenDeadline } from '@/lib/operations/sla-clock-deadlines'
import { OpenDeadlinesPanel } from './open-deadlines-panel'

function deadline(overrides: Partial<OpenDeadline> = {}): OpenDeadline {
  return {
    id: 'log-1',
    label: 'Opportunity stage response',
    subject: 'Opportunity',
    subjectName: null,
    href: '/crm/opportunities/abc',
    status: 'overdue',
    unit: 'business_days',
    remaining: -2,
    dueAt: new Date('2026-09-14T00:00:00+08:00'),
    ...overrides,
  }
}

function render(result: Parameters<typeof OpenDeadlinesPanel>[0]['result']) {
  return renderToStaticMarkup(<OpenDeadlinesPanel result={result} />)
}

describe('OpenDeadlinesPanel', () => {
  beforeEach(() => vi.stubGlobal('React', React))
  afterEach(() => vi.unstubAllGlobals())

  it('shows status as a word beside its mark, the time left, and an accessible link', () => {
    const html = render({
      ok: true,
      total: 3,
      truncated: false,
      deadlines: [
        deadline(),
        deadline({ id: 'log-2', status: 'at_risk', remaining: 1, subject: 'Permit', subjectName: 'Building admin vetting', href: '/projects/p1/permits' }),
        deadline({ id: 'log-3', status: 'on_track', remaining: 4, unit: 'calendar_hours', href: null }),
      ],
    })

    expect(html).toContain('Open deadlines')
    expect(html).toContain('3 open deadlines: 1 overdue, 1 at risk, 1 on track.')
    expect(html).toMatch(/Overdue/)
    expect(html).toMatch(/At risk/)
    expect(html).toMatch(/On track/)
    expect(html).toContain('2 business days overdue')
    expect(html).toContain('1 business day left')
    expect(html).toContain('4 hours left')
    expect(html).toContain('Building admin vetting')
    expect(html).toMatch(/Sep(tember)? 14, 2026|14 Sep(tember)? 2026/)
    expect(html).toContain('href="/projects/p1/permits"')
    expect(html).toContain('Open<span class="sr-only"> Permit</span>')
    // A row with no link renders no link at all.
    expect(html.match(/<a /g)).toHaveLength(2)
  })

  it('says how many are shown when the list is capped', () => {
    const html = render({ ok: true, total: 80, truncated: true, deadlines: [deadline()] })

    expect(html).toContain('Showing the 1 most urgent of 80 open deadlines.')
    expect(html).toContain('More open deadlines exist than can be listed here.')
  })

  it('explains an empty list as a status, not an error', () => {
    const html = render({ ok: true, total: 0, truncated: false, deadlines: [] })

    expect(html).toContain('No open deadlines.')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain('<table')
  })

  it('reports a load failure as an alert with a retry and no table', () => {
    const html = render({ ok: false })

    expect(html).toContain('role="alert"')
    expect(html).toContain('We could not load your open deadlines')
    expect(html).toContain('Try again')
    expect(html).not.toContain('<table')
  })
})
