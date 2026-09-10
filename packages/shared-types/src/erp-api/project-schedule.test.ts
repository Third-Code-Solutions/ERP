import { describe, expect, it } from 'vitest'
import {
  createProjectScheduleTaskCommandSchema,
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
