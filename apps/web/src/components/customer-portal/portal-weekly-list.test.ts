import { describe, expect, it } from 'vitest'
import { weeklySnapshotRows } from './portal-weekly-list'

describe('weeklySnapshotRows', () => {
  it('turns a weekly report snapshot into client-readable rows', () => {
    const rows = weeklySnapshotRows({
      overall_pct: 42,
      by_category: { civil_pct: 50, electrical_pct: 30, mep_pct: 20, finishes_pct: 0 },
      tasks_completed: [{ title: 'Pour slab', assignee: null, completed_at: '2026-11-02T23:30:00.000Z' }],
      milestones_reached: [],
      open_punchlist_count: 3,
      schedule_variance_days: -2,
      photos: [],
      notes: '',
      next_week_focus: '',
    })

    expect(rows).toEqual([
      ['Overall progress', '42%'],
      ['By trade', 'Civil 50% · Electrical 30% · MEP 20% · Finishes 0%'],
      ['Work completed', 'Pour slab — Nov 3, 2026'],
      ['Open punchlist items', '3'],
      ['Schedule', '2 days behind'],
    ])
    expect(JSON.stringify(rows)).not.toMatch(/photos|_pct|T23:30/)
  })
})
