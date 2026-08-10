import { describe, expect, it } from 'vitest'
import {
  todayCommandCenterResultSchema,
  todayQuerySchema,
} from './today'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('Today API contract', () => {
  it('defaults includeProjects to false and accepts explicit boolean strings', () => {
    expect(todayQuerySchema.parse({})).toEqual({ includeProjects: false })
    expect(todayQuerySchema.parse({ includeProjects: 'true' })).toEqual({
      includeProjects: true,
    })
    expect(todayQuerySchema.parse({ includeProjects: 'false' })).toEqual({
      includeProjects: false,
    })
  })

  it('rejects unknown query fields and preserves bounded result shape', () => {
    expect(() => todayQuerySchema.parse({ asOf: '2026-08-10' })).toThrow()
    expect(
      todayCommandCenterResultSchema.parse({
        summary: { dueToday: 1, overdue: 2, upcoming: 3 },
        tasks: [
          {
            id: UUID,
            title: 'Site walk',
            projectId: UUID,
            projectName: 'Harbor fit-out',
            dueDate: '2026-08-10T01:00:00.000Z',
            dueState: 'today',
          },
        ],
        projects: [],
      })
    ).toMatchObject({ summary: { dueToday: 1 } })
  })
})
