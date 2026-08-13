import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { TodayService } from './today.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TASK_ID = '44444444-4444-4444-8444-444444444444'
const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
}
const NOW = new Date('2026-08-10T00:30:00.000Z')
const DUE = new Date('2026-08-10T01:00:00.000Z')

function queryChain<T>(rows: T[]) {
  const terminal = vi.fn().mockResolvedValue(rows)
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => terminal()),
  }
  return { chain, terminal }
}

function harness(includeProjects = true) {
  const today = queryChain([{ value: 1 }])
  const overdue = queryChain([{ value: 2 }])
  const upcoming = queryChain([{ value: 3 }])
  const tasks = queryChain([
    {
      id: TASK_ID,
      title: 'Site walk',
      projectId: PROJECT_ID,
      projectName: 'Harbor fit-out',
      dueDate: DUE,
    },
  ])
  const project = queryChain(
    includeProjects
      ? [
          {
            id: PROJECT_ID,
            name: 'Harbor fit-out',
            client: 'Acme',
            status: 'active' as const,
            updatedAt: new Date('2026-08-09T23:00:00.000Z'),
          },
        ]
      : []
  )
  const select = vi
    .fn()
    .mockReturnValueOnce(today.chain)
    .mockReturnValueOnce(overdue.chain)
    .mockReturnValueOnce(upcoming.chain)
    .mockReturnValueOnce(tasks.chain)
    .mockReturnValueOnce(project.chain)
  const database = { client: { select } } as unknown as DatabaseService
  return { service: new TodayService(database), select, tasks, project }
}

describe('TodayService', () => {
  it('returns tenant and assignee-scoped work with optional projects', async () => {
    const probe = harness()

    await expect(
      probe.service.read({ includeProjects: true }, PRINCIPAL, NOW)
    ).resolves.toEqual({
      summary: { dueToday: 1, overdue: 2, upcoming: 3 },
      tasks: [
        {
          id: TASK_ID,
          title: 'Site walk',
          projectId: PROJECT_ID,
          projectName: 'Harbor fit-out',
          dueDate: DUE.toISOString(),
          dueState: 'today',
        },
      ],
      projects: [
        {
          id: PROJECT_ID,
          name: 'Harbor fit-out',
          client: 'Acme',
          status: 'active',
          updatedAt: '2026-08-09T23:00:00.000Z',
        },
      ],
    })

    expect(probe.select).toHaveBeenCalledTimes(5)
    const taskWhere = probe.tasks.chain.where.mock.calls[0]?.[0]
    expect(taskWhere).toBeDefined()
    const sqlText = new (await import('drizzle-orm/pg-core')).PgDialect().sqlToQuery(
      taskWhere
    )
    expect(sqlText.sql).toContain('"daily_tasks"."tenant_id" = $1')
    expect(sqlText.params).toContain(TENANT_ID)
    expect(sqlText.params).toContain(USER_ID)
  })

  it('does not run project context queries when the caller does not ask for them', async () => {
    const probe = harness(false)
    const viewer = { ...PRINCIPAL, role: 'viewer' as const }

    await expect(
      probe.service.read({ includeProjects: false }, viewer, NOW)
    ).resolves.toMatchObject({ projects: [] })
    expect(probe.select).toHaveBeenCalledTimes(4)
  })
})
