import { describe, expect, it } from 'vitest'
import {
  projectCommandCenterQuerySchema,
  projectCommandCenterResultSchema,
} from './project-command-center'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('project command center Core contract', () => {
  it('accepts an empty query and rejects browser-controlled fields', () => {
    expect(projectCommandCenterQuerySchema.parse({})).toEqual({})
    expect(() => projectCommandCenterQuerySchema.parse({ asOf: 'now' })).toThrow()
  })

  it('bounds counters and serializes optional progress timestamps', () => {
    const result = projectCommandCenterResultSchema.parse({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      pendingTasks: 2,
      overdueTasks: 1,
      documents: 3,
      pendingDecisions: 1,
      openPunchlist: 2,
      activeDeliveries: 1,
      progressPercent: 42,
      progressWeekEnding: '2026-08-10T00:00:00.000Z',
    })
    expect(result.progressPercent).toBe(42)
    expect(() =>
      projectCommandCenterResultSchema.parse({
        ...result,
        pendingTasks: -1,
      })
    ).toThrow()
  })
})
