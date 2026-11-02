import { describe, expect, it } from 'vitest'
import { buildWeeklyReportHtml } from './weekly-report-template'

describe('weekly report company lockup', () => {
  it('uses configured legal identity and its derived mark', () => {
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
      { week_ending: '2026-08-09T00:00:00.000Z', tenant_name: 'Example Builders Corporation' }
    )

    expect(html).toContain('Example Builders Corporation')
    expect(html.match(/>EBC<\/div>/g)).toHaveLength(2)
    expect(html).not.toContain('>A</div>')
  })
})
