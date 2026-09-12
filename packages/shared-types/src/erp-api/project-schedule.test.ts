import { describe, expect, it } from 'vitest'
import {
  createProjectScheduleTaskCommandSchema,
  importLegacyProjectScheduleCommandSchema,
  legacyProjectScheduleTasksSchema,
  projectScheduleDependencyQuerySchema,
  projectScheduleDependencyResultSchema,
  projectScheduleListQuerySchema,
  projectScheduleTaskStatusCommandSchema,
} from './project-schedule'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TASK_ID = '44444444-4444-4444-8444-444444444444'
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

  it('defines a strict, bounded dependency lookup contract', () => {
    expect(projectScheduleDependencyQuerySchema.parse({ kind: 'parent', level: 'l3' })).toEqual({ kind: 'parent', level: 'l3', page: 1, limit: 25 })
    expect(projectScheduleDependencyQuerySchema.parse({ kind: 'predecessor', level: 'l2', excludeTaskId: REQUEST_ID, selectedTaskId: PROJECT_ID, search: '  MEP & 10%  ', page: '2', limit: '100' })).toEqual({ kind: 'predecessor', level: 'l2', excludeTaskId: REQUEST_ID, selectedTaskId: PROJECT_ID, search: 'MEP & 10%', page: 2, limit: 100 })
    for (const invalid of [
      {},
      { kind: 'parent' },
      { kind: 'parent', level: 'l5' },
      { kind: 'parent', level: 'l2', limit: 101 },
      { kind: 'parent', level: 'l2', page: 0 },
      { kind: 'parent', level: 'l2', search: 'x'.repeat(201) },
      { kind: 'parent', level: 'l2', tenantId: PROJECT_ID },
    ]) expect(projectScheduleDependencyQuerySchema.safeParse(invalid).success).toBe(false)
  })

  it('keeps selected dependency options separate from paged rows', () => {
    const option = { id: TASK_ID, projectId: PROJECT_ID, level: 'l1', taskCode: 'L1-001', name: 'Master schedule' }
    expect(projectScheduleDependencyResultSchema.parse({ projectId: PROJECT_ID, kind: 'parent', level: 'l2', rows: [], selected: { ...option, level: 'l4' }, page: 3, limit: 25, total: 0, totalPages: 1 })).toMatchObject({ selected: { id: TASK_ID, level: 'l4' } })
    expect(projectScheduleDependencyResultSchema.safeParse({ projectId: PROJECT_ID, kind: 'parent', level: 'l2', rows: [], selected: null, page: 1, limit: 25, total: 0, totalPages: 0 }).success).toBe(false)
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
