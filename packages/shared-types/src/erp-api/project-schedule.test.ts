import { describe, expect, it } from 'vitest'
import {
  createProjectScheduleTaskCommandSchema,
  importLegacyProjectScheduleCommandSchema,
  legacyProjectScheduleTasksSchema,
  projectScheduleListQuerySchema,
  projectScheduleTaskStatusCommandSchema,
} from './project-schedule'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'

const base = {
  projectId: PROJECT_ID,
  clientRequestId: REQUEST_ID,
  level: 'l2' as const,
  taskCode: 'MEP-001',
  name: 'Install ductwork',
  description: 'Level 2 ductwork installation.',
  parentTaskId: null,
  predecessorTaskId: null,
  plannedStart: '2026-09-10',
  plannedFinish: '2026-09-17',
  plannedLaborMinutes: 480,
  ownerId: null,
  commitmentWeek: '2026-09-14',
  commitmentStatus: 'committed' as const,
  constraintReason: '',
}

describe('project schedule contracts', () => {
  it('binds an import to an explicit snapshot and rejects caller identity', () => {
    expect(importLegacyProjectScheduleCommandSchema.parse({ sourceScheduleId: REQUEST_ID })).toEqual({ sourceScheduleId: REQUEST_ID })
    for (const invalid of [{}, { sourceScheduleId: 'bad' }, { sourceScheduleId: REQUEST_ID, tenantId: PROJECT_ID }, { sourceScheduleId: REQUEST_ID, actorId: PROJECT_ID }]) expect(importLegacyProjectScheduleCommandSchema.safeParse(invalid).success).toBe(false)
  })

  it('validates the whole legacy graph, calendar dates, bounds and cumulative curves', () => {
    const task = { name: 'Install', start_date: '2026-09-01', finish_date: '2026-09-02', predecessor_index: null, planned_pct_curve: [0, 50, 100] }
    expect(legacyProjectScheduleTasksSchema.parse([task, { ...task, predecessor_index: 0 }])).toHaveLength(2)
    for (const invalid of [[], [{ ...task, start_date: '2026-02-30' }], [{ ...task, finish_date: '2026-08-01' }], [{ ...task, predecessor_index: 1 }], [{ ...task, predecessor_index: 0 }], [{ ...task, planned_pct_curve: [50, 10] }], [{ ...task, planned_pct_curve: [101] }], [{ ...task, name: '' }], [{ ...task, predecessor_index: 1 }, { ...task, predecessor_index: 0 }]]) expect(legacyProjectScheduleTasksSchema.safeParse(invalid).success).toBe(false)
  })
  it('defaults bounded list filters', () => {
    expect(projectScheduleListQuerySchema.parse({})).toEqual({ page: 1, limit: 50 })
  })

  it('validates normalized task dates and commitment constraints', () => {
    expect(createProjectScheduleTaskCommandSchema.parse(base).level).toBe('l2')
    expect(() => createProjectScheduleTaskCommandSchema.parse({ ...base, plannedFinish: '2026-09-01' })).toThrow()
    expect(() => createProjectScheduleTaskCommandSchema.parse({ ...base, commitmentStatus: 'not_done', constraintReason: '' })).toThrow()
  })

  it('requires completion evidence for a completed task', () => {
    expect(() => projectScheduleTaskStatusCommandSchema.parse({ expectedVersion: 1, status: 'completed', percentComplete: 100, actualStart: '2026-09-10', actualFinish: null, actualLaborMinutes: 480, commitmentWeek: null, commitmentStatus: 'complete', constraintReason: '' })).toThrow()
    expect(projectScheduleTaskStatusCommandSchema.parse({ expectedVersion: 1, status: 'completed', percentComplete: 100, actualStart: '2026-09-10', actualFinish: '2026-09-17', actualLaborMinutes: 480, commitmentWeek: '2026-09-14', commitmentStatus: 'complete', constraintReason: '' }).status).toBe('completed')
  })
})
