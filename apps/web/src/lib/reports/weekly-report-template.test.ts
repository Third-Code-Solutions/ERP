import { describe, expect, it } from 'vitest'
import { buildWeeklyReportHtml } from './weekly-report-template'

describe('weekly report ABI OPS lockup', () => {
  it('uses ABI OPS fallback copy and A mark in generated reports', () => {
    const html = buildWeeklyReportHtml(
      {
        overall_pct: 42,
        by_category: {
          civil_pct: 40,
          electrical_pct: 45,
          mep_pct: 43,
          finishes_pct: 41,
        },
        tasks_completed: [],
        milestones_reached: [],
        open_punchlist_count: 0,
        schedule_variance_days: 0,
        photos: [],
        notes: '',
        next_week_focus: '',
      },
      { name: 'Project North' },
      null,
      { week_ending: '2026-08-09T00:00:00.000Z' }
    )

    expect(html).toContain('ABI OPS')
    expect(html.match(/>A<\/div>/g)).toHaveLength(2)
    expect(html).not.toContain('>TC<\/div>')
    expect(html).not.toContain('Actuate Builders legacy')
  })
})
