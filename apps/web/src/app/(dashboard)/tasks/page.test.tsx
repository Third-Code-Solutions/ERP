import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

interface QueryMock {
  from(): QueryMock
  innerJoin(): QueryMock
  where(condition: unknown): QueryMock
  orderBy(): QueryMock
  limit(): QueryMock
  then(resolve: (rows: unknown[]) => unknown): Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  wheres: [] as unknown[],
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))
vi.mock('@third-code-erp/database', () => ({
  db: {
    select: () => {
      const query: QueryMock = {
        from: () => query,
        innerJoin: () => query,
        where: (condition) => {
          mocks.wheres.push(condition)
          return query
        },
        orderBy: () => query,
        limit: () => query,
        then: (resolve) => Promise.resolve(resolve([])),
      }
      return query
    },
  },
}))
vi.mock('./actions', () => ({
  completeTask: vi.fn(),
  createTask: vi.fn(),
  triggerDailyGeneration: vi.fn(),
}))

import TasksPage from './page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

function rendered(index: number) {
  return new PgDialect().sqlToQuery(mocks.wheres[index] as SQL)
}

async function renderAs(role: string, searchParams: Record<string, string> = {}) {
  vi.stubGlobal('React', React)
  mocks.profile.mockResolvedValue({
    user: { id: USER_ID },
    tenantId: TENANT_ID,
    role,
    email: `${role}@example.test`,
    fullName: role,
  })
  await TasksPage({ searchParams: Promise.resolve(searchParams) })
}

describe('TasksPage read scope', () => {
  beforeEach(() => {
    mocks.wheres.length = 0
  })

  it.each([
    ['safety', {}],
    ['owner', { scope: 'team', tab: 'open' }],
    ['admin', { scope: 'team', tab: 'completed', project: PROJECT_ID, q: 'walk' }],
  ])('scopes both daily-task reads to the tenant and current assignee for %s (%o)', async (role, params) => {
    await renderAs(role, params)

    for (const index of [0, 1]) {
      const where = rendered(index)
      expect(where.sql.startsWith('("daily_tasks"."tenant_id" = $1 and "daily_tasks"."assignee_id" = $2')).toBe(true)
      expect(where.params.slice(0, 2)).toEqual([TENANT_ID, USER_ID])
    }
  })

  it('narrows by project and escaped search after the tenant and assignee predicates', async () => {
    await renderAs('pm', { project: PROJECT_ID, q: '50%_off' })

    expect(rendered(0).params).toEqual([TENANT_ID, USER_ID, PROJECT_ID, '%50\\%\\_off%', '%50\\%\\_off%'])
  })
})

describe('TasksPage assignee options', () => {
  beforeEach(() => {
    mocks.wheres.length = 0
  })

  it.each([
    ['safety', ['sd_pm_pe', 'pm', 'safety']],
    ['pm', ['sd_pm_pe', 'pm', 'safety']],
    ['sd_pm_pe', ['sd_pm_pe', 'pm', 'safety']],
    ['admin', ['owner', 'admin', 'sd_pm_pe', 'pm', 'safety']],
    ['owner', ['owner', 'admin', 'sd_pm_pe', 'pm', 'safety']],
  ])('offers %s only the roles they may assign to', async (role, assignable) => {
    await renderAs(role)

    const users = rendered(3)
    expect(users.params.slice(0, 2)).toEqual([TENANT_ID, 'active'])
    expect([...users.params.slice(2)].sort()).toEqual([...assignable].sort())
  })

  it('does not load assignees for a role that cannot create tasks', async () => {
    await renderAs('viewer')

    expect(mocks.wheres).toHaveLength(3)
  })
})
